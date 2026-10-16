const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');
const https  = require('https');

const PORT         = 4242;
const CLAUDE_DIR   = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');
const SLEEPING_FILE= path.join(CLAUDE_DIR, 'dashboard', 'sleeping.json');
const NAMES_FILE   = path.join(CLAUDE_DIR, 'dashboard', 'custom_names.json');
const DISMISS_FILE = path.join(CLAUDE_DIR, 'dashboard', 'dismissed.json');
const CACHE_FILE   = path.join(CLAUDE_DIR, 'dashboard', 'transcripts_cache.json');
const HTML_FILE    = path.join(CLAUDE_DIR, 'dashboard', 'dashboard.html');
const VERSION_FILE = path.join(CLAUDE_DIR, 'dashboard', 'version.json');
const VERSION_URL  = 'https://raw.githubusercontent.com/virginiamarcal/session-monitor/master/version.json';

// Sessoes dormindo com mais de 90 dias sem atualizacao sao descartadas.
const SLEEP_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Varredura automatica. Sem isso o monitor so enxergava sessoes mortas no
// momento em que alguem abria o dashboard no navegador — e numa queda de
// energia o Claude Code apaga os arquivos de sessions/ antes disso, levando
// junto qualquer rastro de que aquelas sessoes existiram.
const SCAN_INTERVAL_MS = 10 * 1000;

let updateAvailable = null;

function checkForUpdate() {
  try {
    const local = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version;
    https.get(VERSION_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const remote = JSON.parse(data).version;
          if (remote !== local) {
            updateAvailable = { current: local, latest: remote, url: 'https://github.com/virginiamarcal/session-monitor' };
            console.log('  [!] Atualizacao disponivel: ' + local + ' -> ' + remote);
          } else {
            updateAvailable = null;
          }
        } catch {}
      });
    }).on('error', () => {});
  } catch {}
}

// ─── Verificar se PID ainda está vivo ────────────────────────────────────────
function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ─── Inferir projeto a partir das mensagens ───────────────────────────────────
// Adicione seus próprios projetos abaixo seguindo o mesmo padrão
const PROJECTS = [
  { re: /session.*monitor|dashboard/i, label: 'Session Monitor', emoji: '📡', color: '#0ea5e9' },
  { re: /frontend|react|nextjs/i,      label: 'Frontend',        emoji: '🖥️',  color: '#06b6d4' },
  { re: /backend|api|server/i,         label: 'Backend',         emoji: '⚙️',  color: '#6366f1' },
  { re: /mobile|flutter/i,             label: 'Mobile',          emoji: '📱',  color: '#f97316' },
  { re: /database|sql|supabase/i,      label: 'Database',        emoji: '🗄️',  color: '#84cc16' },
  { re: /deploy|devops|docker/i,       label: 'DevOps',          emoji: '🚀',  color: '#ef4444' },
  { re: /docs|readme|documenta/i,      label: 'Docs',            emoji: '📝',  color: '#f59e0b' },
];
function inferProject(messages) {
  const text = messages.join(' ');
  for (const p of PROJECTS) {
    if (p.re.test(text)) return { label: p.label, emoji: p.emoji, color: p.color };
  }
  return { label: 'Sessão Geral', emoji: '💻', color: '#64748b' };
}

// ─── Nomes customizados ───────────────────────────────────────────────────────
function loadCustomNames() {
  try { return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')); }
  catch { return {}; }
}
function saveCustomName(sessionId, name) {
  const names = loadCustomNames();
  names[sessionId] = name;
  try { fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2)); } catch {}
}

// ─── Persistência de sessões dormindo ─────────────────────────────────────────
function loadSleeping() {
  try { return JSON.parse(fs.readFileSync(SLEEPING_FILE, 'utf8')); }
  catch { return {}; }
}
// Guarda o ultimo conteudo gravado para nao reescrever o arquivo a cada polling.
let lastSleepingJson = null;
function saveSleeping(data) {
  const json = JSON.stringify(data, null, 2);
  if (json === lastSleepingJson) return;
  try {
    fs.writeFileSync(SLEEPING_FILE, json);
    lastSleepingJson = json;
  } catch {}
}

// ─── Ler arquivos de sessão ───────────────────────────────────────────────────
function readSessions() {
  const sessions = {};
  try {
    for (const file of fs.readdirSync(SESSIONS_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
        if (s.sessionId) sessions[s.sessionId] = s;
      } catch {}
    }
  } catch {}
  return sessions;
}

// ─── Ler histórico de mensagens ───────────────────────────────────────────────
function readHistory() {
  const bySession = {};
  try {
    const lines = fs.readFileSync(HISTORY_FILE, { encoding: 'utf8' }).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (!e.sessionId || !e.display) continue;
        if (!bySession[e.sessionId]) bySession[e.sessionId] = [];
        bySession[e.sessionId].push({ text: e.display, ts: e.timestamp || 0 });
      } catch {}
    }
  } catch {}
  for (const sid of Object.keys(bySession)) {
    bySession[sid].sort((a, b) => a.ts - b.ts);
  }
  return bySession;
}

// ─── Sessoes dispensadas pela usuaria ─────────────────────────────────────────
// A varredura automatica reencontra tudo que existe em projects/, entao sem
// esta lista uma sessao dispensada voltaria a aparecer no ciclo seguinte.
function loadDismissed() {
  try { return JSON.parse(fs.readFileSync(DISMISS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveDismissed(data) {
  try { fs.writeFileSync(DISMISS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

// ─── Transcripts: a fonte que sobrevive a queda de energia ────────────────────
// O Claude Code grava cada conversa em projects/<pasta>/<sessionId>.jsonl e so
// remove o arquivo quando a usuaria manda. Diferente de sessions/<pid>.json,
// que e limpo assim que o processo morre.
//
// Ler os ~100 MB de transcripts a cada varredura seria desperdicio, entao o
// resultado por arquivo fica em cache no disco, chaveado por tamanho + mtime.
// Arquivo que nao mudou nao e reaberto — na pratica so a sessao ativa e relida.
let cacheTranscripts = null;
let cacheSujo = false;

function loadCacheTranscripts() {
  if (cacheTranscripts) return cacheTranscripts;
  try { cacheTranscripts = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { cacheTranscripts = {}; }
  return cacheTranscripts;
}
function flushCacheTranscripts() {
  if (!cacheSujo) return;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheTranscripts)); cacheSujo = false; } catch {}
}

// Extrai de um transcript so o que o painel precisa para montar o card.
function lerTranscript(arquivo) {
  const resumo = { cwd: null, title: null, lastPrompt: null, messageCount: 0 };
  let conteudo;
  try { conteudo = fs.readFileSync(arquivo, 'utf8'); } catch { return resumo; }

  for (const linha of conteudo.split('\n')) {
    if (!linha.trim()) continue;
    let o;
    try { o = JSON.parse(linha); } catch { continue; }

    // O primeiro cwd e a pasta onde a sessao nasceu — a que serve para retomar.
    // Linhas posteriores podem apontar para scratchpad e outras pastas de passagem.
    if (!resumo.cwd && o.cwd) resumo.cwd = o.cwd;
    if (o.type === 'ai-title'    && o.aiTitle)    resumo.title      = o.aiTitle;
    if (o.type === 'last-prompt' && o.lastPrompt) resumo.lastPrompt = o.lastPrompt;
    if (o.type === 'last-prompt') resumo.messageCount++;
  }
  return resumo;
}

function readTranscripts(cutoff) {
  const cache = loadCacheTranscripts();
  const achados = {};
  const vistos = new Set();

  let pastas;
  try { pastas = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch { return achados; }

  for (const pasta of pastas) {
    if (!pasta.isDirectory() || pasta.name === 'subagents') continue;
    const dir = path.join(PROJECTS_DIR, pasta.name);

    let arquivos;
    try { arquivos = fs.readdirSync(dir); } catch { continue; }

    for (const nome of arquivos) {
      if (!nome.endsWith('.jsonl')) continue;
      const arquivo = path.join(dir, nome);

      let st;
      try { st = fs.statSync(arquivo); } catch { continue; }
      if (st.mtimeMs < cutoff) continue; // fora do TTL: nem vale abrir

      const chave  = arquivo;
      const marca  = st.size + ':' + Math.round(st.mtimeMs);
      vistos.add(chave);

      let dados = cache[chave];
      if (!dados || dados.marca !== marca) {
        dados = Object.assign({ marca }, lerTranscript(arquivo));
        cache[chave] = dados;
        cacheSujo = true;
      }

      achados[nome.replace(/\.jsonl$/, '')] = {
        cwd:          dados.cwd,
        title:        dados.title,
        lastPrompt:   dados.lastPrompt,
        messageCount: dados.messageCount,
        updatedAt:    Math.round(st.mtimeMs),
      };
    }
  }

  // Descarta do cache os transcripts que sairam do TTL ou foram apagados.
  for (const chave of Object.keys(cache)) {
    if (!vistos.has(chave)) { delete cache[chave]; cacheSujo = true; }
  }
  flushCacheTranscripts();
  return achados;
}

// ─── Construir dados da API ───────────────────────────────────────────────────
function buildData() {
  const now         = Date.now();
  const cutoff      = now - SLEEP_TTL_MS;
  const sessions    = readSessions();
  const history     = readHistory();
  const transcripts = readTranscripts(cutoff);
  const sleeping    = loadSleeping();
  const customNames = loadCustomNames();
  const dismissed   = loadDismissed();
  const active   = [];
  const newSleep = Object.assign({}, sleeping);

  // Monta o card de uma sessao juntando o que cada fonte sabe de melhor:
  // sessions/ da o estado ao vivo, o transcript da titulo/pasta/ultimo prompt,
  // e o history serve de reserva para sessoes antigas sem transcript.
  function montar(sessionId, s, t) {
    const msgs     = (history[sessionId] || []).map(m => m.text);
    const inferred = inferProject(msgs.concat(t && t.title ? [t.title] : []));

    if (t && t.title) inferred.label = t.title;
    if (customNames[sessionId]) inferred.label = customNames[sessionId];

    const ultima = (t && t.lastPrompt) || msgs[msgs.length - 1] || '';
    const total  = Math.max((t && t.messageCount) || 0, msgs.length);

    return {
      sessionId,
      pid:          s ? s.pid : 0,
      status:       'sleeping',
      project:      inferred,
      lastMessage:  ultima.slice(0, 200),
      messageCount: total,
      cwd:          (t && t.cwd) || (s && s.cwd) || os.homedir(),
      updatedAt:    Math.max((s && s.updatedAt) || 0, (t && t.updatedAt) || 0) || now,
    };
  }

  const vivas = new Set();

  for (const s of Object.values(sessions)) {
    const alive = isPidAlive(s.pid);
    const entry = montar(s.sessionId, s, transcripts[s.sessionId]);

    if (alive) {
      entry.status = s.status || 'idle';
      active.push(entry);
      vivas.add(s.sessionId);
      delete newSleep[s.sessionId];
    } else if (entry.messageCount > 0) {
      newSleep[s.sessionId] = entry;
    }
  }

  // Rede de segurança: toda conversa em projects/ dentro do TTL que nao esta
  // viva entra como dormindo, mesmo que sessions/<pid>.json ja tenha sumido.
  // E o que faz uma queda de energia deixar de apagar sessoes do painel.
  for (const [sessionId, t] of Object.entries(transcripts)) {
    if (vivas.has(sessionId) || dismissed[sessionId]) continue;
    if (!t.messageCount) continue; // sessao aberta e fechada sem uso
    newSleep[sessionId] = montar(sessionId, sessions[sessionId], t);
  }

  // Descarta sessoes dormindo paradas ha mais de 90 dias.
  for (const sid of Object.keys(newSleep)) {
    if ((newSleep[sid].updatedAt || 0) < cutoff) delete newSleep[sid];
  }

  saveSleeping(newSleep);

  const statusOrder = { busy: 0, shell: 1, idle: 2 };
  active.sort((a, b) => {
    const d = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    return d !== 0 ? d : (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const sleepingArr = Object.values(newSleep)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return { active, sleeping: sleepingArr };
}

// ─── Abre no Windows Terminal (wt) com perfil PowerShell, igual ao terminal ────
// ─── que a usuária usa. Usa .ps1 temporário p/ evitar quoting quebrado. ───────
// Literal entre aspas simples do PowerShell: nada dentro dele e interpretado,
// so a propria aspa simples precisa ser dobrada.
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function openTerminal(cwd, claudeArgs) {
  const ps1Path = path.join(os.tmpdir(), `claude_session_${Date.now()}.ps1`);
  const ps1Content = `Set-Location -LiteralPath ${psQuote(cwd)}\nclaude ${claudeArgs}\n`;
  fs.writeFileSync(ps1Path, ps1Content, 'utf8');
  execSync(`start "" wt.exe powershell.exe -NoExit -ExecutionPolicy Bypass -File "${ps1Path}"`, { shell: 'cmd.exe' });
}

// ─── Seguranca ────────────────────────────────────────────────────────────────
// O id de sessao do Claude Code e sempre um UUID. Qualquer outra coisa e
// recusada antes de chegar perto do terminal — era por ai que um site
// malicioso conseguia esconder um comando no botao "Retomar".
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isSessionId(s) { return typeof s === 'string' && SESSION_ID_RE.test(s); }

// So o proprio painel pode falar com o servidor. O Host barra DNS rebinding
// (um dominio de fora apontado para 127.0.0.1); Origin e Sec-Fetch-Site barram
// outro site aberto no navegador tentando ler sessoes ou disparar acoes.
const ALLOWED_HOSTS   = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);
function requestAllowed(req) {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) return false;
  // A pagina em si nao carrega dado nenhum (tudo vem de /api/) e pode ser
  // aberta por link ou atalho; so nao pode ser embutida (X-Frame-Options).
  if (req.method === 'GET' && !req.url.startsWith('/api/')) return true;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin.toLowerCase())) return false;
  if (req.method !== 'GET') {
    // Acoes exigem Origin do painel e um cabecalho proprio: um navegador nao
    // deixa outro site mandar esse cabecalho sem permissao, que nunca damos.
    if (!origin) return false;
    if (req.headers['x-session-monitor'] !== '1') return false;
  }
  return true;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

// ─── Retomar sessão específica ────────────────────────────────────────────────
function resumeSession(sessionId) {
  if (!isSessionId(sessionId)) return { ok: false, error: 'id invalido' };
  const sleeping = loadSleeping();
  const entry = sleeping[sessionId] || {};
  const cwd = entry.cwd || os.homedir();

  try {
    openTerminal(cwd, `--resume ${sessionId}`);
    delete sleeping[sessionId];
    saveSleeping(sleeping);
    return { ok: true, cwd };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Reiniciar sessão: abre claude limpo na mesma pasta ───────────────────────
function restartSession(sessionId) {
  if (!isSessionId(sessionId)) return { ok: false, error: 'id invalido' };
  const sleeping = loadSleeping();
  const entry = sleeping[sessionId] || {};
  const cwd = entry.cwd || os.homedir();

  try {
    openTerminal(cwd, '');
    delete sleeping[sessionId];
    saveSleeping(sleeping);
    return { ok: true, cwd };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Servidor HTTP ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (!requestAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  if (url === '/api/sessions' && req.method === 'GET') {
    try {
      const data = buildData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.startsWith('/api/dismiss/') && req.method === 'POST') {
    const sessionId = url.replace('/api/dismiss/', '').trim();
    if (!isSessionId(sessionId)) { res.writeHead(400); res.end('{}'); return; }
    const sleeping = loadSleeping();
    delete sleeping[sessionId];
    saveSleeping(sleeping);
    // Marca como dispensada para a varredura nao trazer de volta.
    const dismissed = loadDismissed();
    dismissed[sessionId] = Date.now();
    saveDismissed(dismissed);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === '/api/rename' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const { sessionId, name } = JSON.parse(body);
        if (!isSessionId(sessionId) || typeof name !== 'string') throw new Error('invalido');
        const limpo = name.trim().slice(0, 80);
        if (limpo) saveCustomName(sessionId, limpo);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); res.end('{}');
      }
    });
    return;
  }

  if (url.startsWith('/api/resume/') && req.method === 'POST') {
    const sessionId = url.replace('/api/resume/', '').trim();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resumeSession(sessionId)));
    return;
  }

  if (url.startsWith('/api/restart/') && req.method === 'POST') {
    const sessionId = url.replace('/api/restart/', '').trim();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(restartSession(sessionId)));
    return;
  }

  if (url === '/api/version' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ update: updateAvailable }));
    return;
  }


  // Serve o dashboard HTML
  try {
    const html = fs.readFileSync(HTML_FILE);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(500); res.end('dashboard.html not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  checkForUpdate();
  // Varre sozinho, sem depender de alguem abrir o dashboard. Antes, uma sessao
  // que morresse enquanto o painel estava fechado sumia sem deixar rastro.
  const varrer = () => { try { buildData(); } catch (e) { console.log('  [!] varredura: ' + e.message); } };
  varrer();
  setInterval(varrer, SCAN_INTERVAL_MS);
  // Re-checa o GitHub periodicamente (a cada 1h) — antes so checava no boot,
  // entao quem deixava o PC ligado nunca via o banner de nova versao.
  setInterval(checkForUpdate, 60 * 60 * 1000);
  console.log('');
  console.log('  ╔══════════════════════════════════╗');
  console.log('  ║   ✦ Claude Code Session Monitor  ║');
  console.log('  ║   → http://localhost:' + PORT + '       ║');
  console.log('  ║   Ctrl+C para parar              ║');
  console.log('  ╚══════════════════════════════════╝');
  console.log('');
});
