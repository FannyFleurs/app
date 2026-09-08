// CodeMap — serveur local (127.0.0.1 uniquement). Indexe le dépôt, sert l'UI et
// une petite API JSON. OUTIL DE DÉVELOPPEMENT LOCAL : jamais en production,
// jamais importé par HelloPos, aucun accès réseau sortant, lecture seule du
// dépôt (seule écriture = le cache .index.json). Zéro dépendance.
//
// Lancement :  npm run codemap   →   http://127.0.0.1:4321
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildIndex, derivePostings } from './indexer.mjs';
import { search, resolveWhere, architecture } from './search.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..'); // racine du dépôt
const CACHE = path.join(HERE, '.index.json');
const PORT = Number(process.env.CODEMAP_PORT || 4321);
const HOST = '127.0.0.1';

let ctx = null;      // { index, post, contentPost, root }
let reindexing = false;

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
}
function saveCache(index) {
  try { fs.writeFileSync(CACHE, JSON.stringify(index)); } catch { /* cache best-effort */ }
}
function refresh() {
  const prev = ctx?.index ?? loadCache();
  const index = buildIndex(ROOT, prev);
  const { post, contentPost } = derivePostings(index);
  ctx = { index, post, contentPost, root: ROOT };
  saveCache(index);
  return index;
}

// ---------------------------------------------------------------- utilitaires HTTP
function send(res, code, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
/** Résout un chemin relatif demandé et garantit qu'il reste DANS le dépôt et indexé. */
function safeRel(rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  const norm = path.relative(ROOT, abs).split(path.sep).join('/');
  if (!ctx.index.files[norm]) return null;
  return { abs, rel: norm };
}

function openInVsCode(abs, line) {
  const target = line ? `${abs}:${line}` : abs;
  return new Promise((resolve) => {
    const tryOpen = (cmd, args) => new Promise((r) => {
      const ch = spawn(cmd, args, { stdio: 'ignore' });
      ch.on('error', () => r(false));
      ch.on('exit', (code) => r(code === 0 || code === null));
    });
    tryOpen('code', ['-g', target]).then((ok) => {
      if (ok) return resolve({ ok: true, via: 'code' });
      // Repli macOS : ouvre le fichier dans VS Code (sans la ligne).
      tryOpen('open', ['-a', 'Visual Studio Code', abs]).then((ok2) =>
        resolve(ok2 ? { ok: true, via: 'open' } : { ok: false, error: 'VS Code introuvable (installez la commande « code » via VS Code → Shell Command).' }));
    });
  });
}

// ---------------------------------------------------------------- serveur
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;
  try {
    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(HERE, 'ui.html'), 'utf8'), 'text/html');
    }
    if (p === '/api/meta') {
      return send(res, 200, { indexedAt: ctx.index.indexedAt, fileCount: ctx.index.fileCount, port: PORT });
    }
    if (p === '/api/architecture') {
      return send(res, 200, architecture(ctx));
    }
    if (p === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      const mode = url.searchParams.get('mode') ?? 'search';
      if (!q.trim()) return send(res, 200, { results: [], query: q });
      if (mode === 'where') return send(res, 200, await resolveWhere(ctx, q));
      return send(res, 200, search(ctx, q));
    }
    if (p === '/api/file') {
      const s = safeRel(url.searchParams.get('path'));
      if (!s) return send(res, 400, { error: 'BAD_PATH' });
      const from = Math.max(1, Number(url.searchParams.get('from') || 1));
      const to = Number(url.searchParams.get('to') || from + 40);
      const lines = fs.readFileSync(s.abs, 'utf8').split('\n');
      return send(res, 200, {
        path: s.rel, from, to: Math.min(to, lines.length),
        lines: lines.slice(from - 1, to).map((text, i) => ({ n: from + i, text })),
      });
    }
    if (p === '/api/reindex' && req.method === 'POST') {
      if (reindexing) return send(res, 200, { indexedAt: ctx.index.indexedAt, fileCount: ctx.index.fileCount, busy: true });
      reindexing = true;
      try { refresh(); } finally { reindexing = false; }
      return send(res, 200, { indexedAt: ctx.index.indexedAt, fileCount: ctx.index.fileCount });
    }
    if (p === '/api/open' && req.method === 'POST') {
      const body = await readBody(req);
      const s = safeRel(body.path);
      if (!s) return send(res, 400, { ok: false, error: 'BAD_PATH' });
      return send(res, 200, await openInVsCode(s.abs, body.line));
    }
    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) });
  }
});

console.log('[CodeMap] Indexation initiale…');
const t0 = Date.now();
refresh();
console.log(`[CodeMap] ${ctx.index.fileCount} fichiers indexés en ${Date.now() - t0} ms.`);
server.listen(PORT, HOST, () => {
  console.log(`[CodeMap] Prêt → http://${HOST}:${PORT}  (Ctrl+C pour arrêter)`);
});
