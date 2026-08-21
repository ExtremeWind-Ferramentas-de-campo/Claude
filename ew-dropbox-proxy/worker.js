/* ═══════════════════════════════════════════════════════════════════════════
   EW — GATEWAY ÚNICO (Cloudflare Worker)
   ───────────────────────────────────────────────────────────────────────────
   POR QUE ISSO EXISTE

   Um site estático (GitHub Pages) NÃO consegue guardar segredo. Tudo que está
   no HTML/JS chega no navegador do usuário: basta "ver código-fonte", abrir o
   DevTools, olhar a aba Network, o cache do Service Worker ou o próprio
   repositório no GitHub. Ofuscar (base64, XOR, quebrar a string em pedaços)
   só atrasa quem está olhando de passagem — não é segurança.

   Então o app de campo não tem mais NENHUM segredo. Ele só conhece a URL
   pública deste Worker. Quem guarda segredo é este arquivo aqui, através das
   variáveis de ambiente do Cloudflare (Settings → Variables and Secrets), que
   nunca saem do servidor.

   VARIÁVEIS — os nomes abaixo são os que já existem neste Worker:

     ALLOWED_ORIGIN         origem autorizada. Aceita mais de uma separada por
                            vírgula. Ex.: https://ramiroew.github.io
     DROPBOX_REFRESH_TOKEN  ┐
     DROPBOX_APP_KEY        ├ credenciais do Dropbox (Secret)
     DROPBOX_APP_SECRET     ┘  (ou DROPBOX_ACCESS_TOKEN, token de longa duração)
     GAS_URL                URL /exec do Apps Script (Secret) — para de ser pública
     MAX_MB                 teto do upload em MB (padrão 30)

   ⚠️ FALTA CADASTRAR:
     GAS_SECRET             segredo compartilhado só entre este Worker e o Apps
                            Script. O MESMO valor vai em Propriedades do script,
                            no Apps Script. É o que fecha o endpoint da planilha.

   Opcional:
     DROPBOX_ROOT           pasta raiz das fotos. Sem ela, o caminho continua
                            exatamente como é hoje (/cliente/parque/torre/…).

   O QUE ESTE WORKER GARANTE
     • Só responde a requisição vinda das origens autorizadas (checagem de
       Origin no servidor + CORS restrito, sem "*").
     • Só escreve. Não lista, não baixa, não apaga, não move nada.
     • Todo caminho de upload é forçado para dentro de DROPBOX_ROOT, com o
       nome higienizado (sem "..", sem barra dupla, sem caractere de controle).
     • Tamanho de corpo limitado.
     • A URL do Apps Script e o segredo dele nunca chegam ao navegador, então o
       Apps Script deixa de ser um endpoint aberto na internet.

   O QUE ELE NÃO GARANTE
     A checagem de Origin vale contra o navegador de outra pessoa, não contra
     um curl com cabeçalho forjado. O pior caso é alguém subir arquivo dentro
     da pasta de fotos ou empurrar linha na planilha — não há como ler, apagar
     nem chegar na conta do Dropbox. Para fechar isso de verdade: Cloudflare
     Access (login corporativo) ou PIN por técnico trocado por token curto.

   DEPLOY
     1. Cloudflare Dashboard → Workers → o worker existente → Edit code
     2. Cole este arquivo inteiro e salve/deploy
     3. Settings → Variables and Secrets → cadastre as variáveis acima
     4. Apps Script: Configurações do projeto → Propriedades do script →
        GAS_SECRET com o MESMO valor, e publique uma implantação NOVA
   ═══════════════════════════════════════════════════════════════════════════ */

/* Marca da versão: aparece em /ping e /diag. Serve para saber, sem dúvida,
   QUAL código está no ar — foi exatamente a confusão do deploy anterior. */
const VERSAO = '2026-08-07';

const LIMITE_JSON = 512 * 1024;           // 512 KB — payload da planilha
const limiteUpload = env => (Number(env.MAX_MB) || 30) * 1024 * 1024;

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '';
    const permitidas = (env.ALLOWED_ORIGIN || env.ORIGENS || '')
      .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

    // Falha fechada: sem origem configurada, ninguém entra.
    if (!permitidas.length) {
      return json({ ok: false, error: 'servidor_sem_ALLOWED_ORIGIN' }, 500, null);
    }

    const origemOk = permitidas.includes(origem.replace(/\/+$/, ''));
    const cors = origemOk ? origem : null;

    if (req.method === 'OPTIONS') {
      if (!origemOk) return json({ ok: false, error: 'origem_nao_autorizada' }, 403, null);
      return new Response(null, { status: 204, headers: cabecalhos(cors, true) });
    }

    // Requisição sem Origin (curl, script) ou de origem estranha: recusa.
    if (!origemOk) return json({ ok: false, error: 'origem_nao_autorizada' }, 403, null);

    const rota = new URL(req.url).pathname.replace(/\/+$/, '') || '/';

    try {
      if (rota === '/ping'     && req.method === 'GET')  return json({ ok: true, versao: VERSAO }, 200, cors);
      if (rota === '/diag'     && req.method === 'GET')  return await diag(env, cors);
      if (rota === '/upload'   && req.method === 'POST') return await upload(req, env, cors);
      if (rota === '/sheets'   && req.method === 'POST') return await paraPlanilha(req, env, cors);
      if (rota === '/parques'  && req.method === 'GET')  return await parques(env, cors);
      return json({ ok: false, error: 'rota_desconhecida' }, 404, cors);
    } catch (err) {
      // Mensagem genérica para fora; o detalhe fica no log do Worker.
      console.log('erro', rota, err && err.message);
      return json({ ok: false, error: 'falha_interna' }, 500, cors);
    }
  }
};

/* ─── GET /diag — autoteste do deploy ───
   Diz o que está configurado e testa as DUAS pontas de verdade (pega token no
   Dropbox e consulta a planilha), sem escrever nada. Nunca devolve o valor de
   nenhum segredo, só se ele existe. Exige origem autorizada, como o resto. */
async function diag(env, cors) {
  const tem = v => !!(env[v] && String(env[v]).length);
  const r = {
    versao: VERSAO,
    ALLOWED_ORIGIN: env.ALLOWED_ORIGIN || env.ORIGENS || '(faltando)',
    GAS_URL: tem('GAS_URL'),
    GAS_SECRET: tem('GAS_SECRET'),
    credenciais_dropbox: env.DROPBOX_ACCESS_TOKEN ? 'access_token'
      : (tem('DROPBOX_REFRESH_TOKEN') && tem('DROPBOX_APP_KEY') && tem('DROPBOX_APP_SECRET'))
        ? 'refresh_token' : '(faltando)',
    max_mb: Number(env.MAX_MB) || 30,
    pasta_raiz: env.DROPBOX_ROOT || '(raiz — igual a hoje)'
  };

  // Ponta 1: o Apps Script aceita o nosso segredo?
  if (r.GAS_URL && r.GAS_SECRET) {
    try {
      const u = env.GAS_URL + (env.GAS_URL.includes('?') ? '&' : '?') +
                'tipo=parques&segredo=' + encodeURIComponent(env.GAS_SECRET);
      const g = await fetch(u, { redirect: 'follow' });
      const t = await g.text();
      let j = {}; try { j = JSON.parse(t); } catch (e) {}
      r.planilha = !g.ok ? ('HTTP ' + g.status)
        : Array.isArray(j.parques) ? ('ok — ' + j.parques.length + ' parque(s)')
        : (j.erro || 'resposta inesperada');
    } catch (e) { r.planilha = 'falha de rede'; }
  } else {
    r.planilha = 'nao configurada';
  }

  // Ponta 2: as credenciais do Dropbox rendem um token? (não sobe arquivo)
  try { await tokenDropbox(env); r.dropbox = 'ok'; }
  catch (e) { r.dropbox = e.message; }

  r.ok = (r.dropbox === 'ok') && String(r.planilha).indexOf('ok') === 0;
  return json(r, 200, cors);
}

/* ─── CORS / resposta ─── */
function cabecalhos(cors, preflight) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (cors) {
    h['Access-Control-Allow-Origin'] = cors;
    h['Vary'] = 'Origin';
    if (preflight) {
      h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      // X-EW-Token é aceito só para não quebrar app antigo em campo; é ignorado.
      h['Access-Control-Allow-Headers'] = 'Content-Type, X-EW-Path, X-EW-Token';
      h['Access-Control-Max-Age'] = '86400';
    }
  }
  return h;
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: cabecalhos(cors, false) });
}

/* ─── Caminho do arquivo: sempre dentro da raiz, sempre higienizado ─── */
function caminhoSeguro(bruto, raiz) {
  let p = '';
  try { p = decodeURIComponent(bruto || ''); } catch (e) { p = String(bruto || ''); }

  const partes = p.split('/')
    .map(s => s
      .replace(/[\x00-\x1f\x7f]/g, '')        // controle
      .replace(/[\\:*?"<>|]/g, '-')           // proibidos no Dropbox
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+$/, '')                   // "." e ".." não sobrevivem
      .slice(0, 80))
    .filter(Boolean)
    .slice(0, 6);                             // no máximo 6 níveis

  if (!partes.length) return null;
  const nome = partes[partes.length - 1];
  if (!/\.(jpe?g|png|webp)$/i.test(nome)) return null;   // só imagem

  return (raiz.replace(/\/+$/, '') + '/' + partes.join('/')).replace(/\/{2,}/g, '/');
}

/* ─── Token do Dropbox: refresh token (recomendado) ou token fixo ─── */
async function tokenDropbox(env) {
  if (env.DROPBOX_ACCESS_TOKEN) return env.DROPBOX_ACCESS_TOKEN;
  if (!env.DROPBOX_REFRESH_TOKEN || !env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
    throw new Error('credenciais_dropbox_ausentes');
  }
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(env.DROPBOX_APP_KEY + ':' + env.DROPBOX_APP_SECRET)
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(env.DROPBOX_REFRESH_TOKEN)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('refresh_falhou');
  return j.access_token;
}

/* ─── POST /upload ─── */
async function upload(req, env, cors) {
  // Sem DROPBOX_ROOT o caminho fica igual ao de hoje: /cliente/parque/torre/…
  const raiz = env.DROPBOX_ROOT || '';
  const destino = caminhoSeguro(req.headers.get('X-EW-Path'), raiz);
  if (!destino) return json({ ok: false, error: 'caminho_invalido' }, 400, cors);

  const teto = limiteUpload(env);
  const tam = Number(req.headers.get('Content-Length') || 0);
  if (tam > teto) return json({ ok: false, error: 'arquivo_grande' }, 413, cors);

  const bytes = await req.arrayBuffer();
  if (!bytes.byteLength) return json({ ok: false, error: 'corpo_vazio' }, 400, cors);
  if (bytes.byteLength > teto) return json({ ok: false, error: 'arquivo_grande' }, 413, cors);

  const token = await tokenDropbox(env);
  const r = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: destino,
        mode: 'add',              // nunca sobrescreve arquivo existente
        autorename: true,
        mute: true,
        strict_conflict: false
      })
    },
    body: bytes
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.log('dropbox', r.status, JSON.stringify(j).slice(0, 300));
    return json({ ok: false, error: 'dropbox_recusou' }, 502, cors);
  }
  return json({ ok: true, path_display: j.path_display || destino }, 200, cors);
}

/* ─── POST /sheets → Apps Script (o segredo entra aqui, no servidor) ─── */
async function paraPlanilha(req, env, cors) {
  if (!env.GAS_URL || !env.GAS_SECRET) return json({ ok: false, error: 'planilha_nao_configurada' }, 500, cors);

  const texto = await req.text();
  if (texto.length > LIMITE_JSON) return json({ ok: false, error: 'payload_grande' }, 413, cors);

  let corpo;
  try { corpo = JSON.parse(texto); } catch (e) { return json({ ok: false, error: 'json_invalido' }, 400, cors); }

  // Array (calculadoras) ou objeto (checklist) — o segredo vai por fora do dado.
  const envelope = Array.isArray(corpo)
    ? { segredo: env.GAS_SECRET, tipo: 'consumo_calculadora', linhas: corpo }
    : Object.assign({}, corpo, { segredo: env.GAS_SECRET });

  const r = await fetch(env.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(envelope),
    redirect: 'follow'
  });
  const t = await r.text();
  if (!r.ok) { console.log('gas', r.status, t.slice(0, 200)); return json({ ok: false, error: 'planilha_recusou' }, 502, cors); }
  return new Response(t, { status: 200, headers: cabecalhos(cors, false) });
}

/* ─── GET /parques ─── */
async function parques(env, cors) {
  if (!env.GAS_URL || !env.GAS_SECRET) return json({ parques: [] }, 200, cors);
  const u = env.GAS_URL + (env.GAS_URL.includes('?') ? '&' : '?') +
            'tipo=parques&segredo=' + encodeURIComponent(env.GAS_SECRET);
  const r = await fetch(u, { redirect: 'follow' });
  const t = await r.text();
  if (!r.ok) return json({ parques: [] }, 200, cors);
  return new Response(t, { status: 200, headers: cabecalhos(cors, false) });
}
