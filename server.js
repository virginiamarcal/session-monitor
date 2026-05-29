const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');
const https  = require('https');
const https  = require('https');

const PORT         = 4242;
const CLAUDE_DIR   = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');
const SLEEPING_FILE= path.join(CLAUDE_DIR, 'dashboard', 'sleeping.json');
const NAMES_FILE   = path.join(CLAUDE_DIR, 'dashboard', 'custom_names.json');
const HTML_FILE    = path.join(CLAUDE_DIR, 'dashboard', 'dashboard.html');
const VERSION_FILE = path.join(CLAUDE_DIR, 'dashboard', 'version.json');
const VERSION_URL  = 'https://raw.githubusercontent.com/virginiamarcal/session-monitor/master/version.json';

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
          }
        } catch {}
      });
    }).on('error', () => {});
  } catch {}
}
const VERSION_FILE = path.join(CLAUDE_DIR, 'dashboard', 'version.json');
const VERSION_URL  = 'https://raw.githubusercontent.com/virginiamarcal/session-monitor/master/version.json';

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
function saveSleeping(data) {
  try { fs.writeFileSync(SLEEPING_FILE, JSON.stringify(data, null, 2)); } catch {}
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

// ─── Construir dados da API ───────────────────────────────────────────────────
function buildData() {
  const sessions    = readSessions();
  const history     = readHistory();
  const sleeping    = loadSleeping();
  const customNames = loadCustomNames();
  const now         = Date.now();
  const active   = [];
  const newSleep = Object.assign({}, sleeping);

  for (const s of Object.values(sessions)) {
    const alive = isPidAlive(s.pid);
    const msgs  = (history[s.sessionId] || []).map(m => m.text);
    const inferred = inferProject(msgs);
    if (customNames[s.sessionId]) inferred.label = customNames[s.sessionId];
    const entry = {
      sessionId:    s.sessionId,
      pid:          s.pid,
      status:       alive ? (s.status || 'idle') : 'sleeping',
      project:      inferred,
      lastMessage:  (msgs[msgs.length - 1] || '').slice(0, 200),
      messageCount: msgs.length,
      cwd:          s.cwd || os.homedir(),
      updatedAt:    s.updatedAt || now,
    };

    if (alive) {
      active.push(entry);
      delete newSleep[s.sessionId];
    } else if (msgs.length > 0) {
      newSleep[s.sessionId] = entry;
    }
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

// ─── Abre terminal via .bat temporário (evita quoting quebrado no Windows) ────
function openTerminal(cwd, claudeArgs) {
  const batPath = path.join(os.tmpdir(), `claude_session_${Date.now()}.bat`);
  const batContent = `@echo off\ncd /d "${cwd}"\nclaude ${claudeArgs}\n`;
  fs.writeFileSync(batPath, batContent, 'utf8');
  execSync(`start "" cmd.exe /k "${batPath}"`, { shell: 'cmd.exe' });
}

// ─── Retomar sessão específica ────────────────────────────────────────────────
function resumeSession(sessionId) {
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

  if (url === '/api/sessions' && req.method === 'GET') {
    try {
      const data = buildData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.startsWith('/api/dismiss/') && req.method === 'POST') {
    const sessionId = url.replace('/api/dismiss/', '').trim();
    const sleeping = loadSleeping();
    delete sleeping[sessionId];
    saveSleeping(sleeping);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === '/api/rename' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { sessionId, name } = JSON.parse(body);
        if (sessionId && name) saveCustomName(sessionId, name);
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
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ update: updateAvailable }));
    return;
  }

  if (url === '/api/version' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
  console.log('');
  console.log('  ╔══════════════════════════════════╗');
  console.log('  ║   ✦ Claude Code Session Monitor  ║');
  console.log('  ║   → http://localhost:' + PORT + '       ║');
  console.log('  ║   Ctrl+C para parar              ║');
  console.log('  ╚══════════════════════════════════╝');
  console.log('');
});
