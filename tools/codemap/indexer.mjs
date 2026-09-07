// CodeMap — indexeur. Parcourt le dépôt sur disque, extrait des « occurrences »
// structurées (définitions, routes, tables, imports, textes d'interface…) et
// des tokens de contenu, puis en dérive un index de recherche. Aucune écriture
// dans le dépôt (hors le cache .index.json géré par server.mjs). Zéro dépendance.
import fs from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------------ Normalisation
// Recherche tolérante : on retire les accents, on met en minuscules, on découpe
// le camelCase (closeRegister -> close register) et on réduit les pluriels
// simples (FR/EN). Les mêmes fonctions servent à l'indexation ET à la requête,
// pour que « clôture » retrouve « cloture », « caisses » retrouve « caisse », etc.
export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export function normalizeText(s) {
  return stripAccents(s).toLowerCase();
}
export function splitCamel(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}
export function stem(t) {
  if (t.length > 4 && t.endsWith('aux')) return `${t.slice(0, -3)}al`;
  if (t.length > 3 && /(s|x)$/.test(t)) return t.slice(0, -1);
  return t;
}
/** Découpe une chaîne en tokens normalisés + racines (dédupliqués). */
export function tokenize(s) {
  const base = normalizeText(splitCamel(s));
  const out = new Set();
  for (const w of base.split(/[^a-z0-9]+/)) {
    if (w.length < 2) continue;
    out.add(w);
    const st = stem(w);
    if (st !== w) out.add(st);
  }
  return [...out];
}

// ------------------------------------------------------------------ Parcours disque
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'coverage', '.vercel', '.turbo',
  'build', 'out', '.cache', 'uploads', 'tmp', '.claude',
]);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.css', '.md']);
// On n'indexe pas l'outil lui-même.
const SELF_DIR = 'tools/codemap';
// Mots-clés à ne PAS confondre avec des définitions de méthode (`if (`, etc.).
const METHOD_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor',
  'else', 'do', 'await', 'typeof', 'new', 'case', 'yield', 'super',
]);

function walk(root, dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') {
      // On ignore les dotfiles/dossiers cachés (sauf ce qui est utile est déjà couvert).
      if (e.isDirectory()) continue;
    }
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (rel === SELF_DIR) continue;
      walk(root, abs, acc);
    } else if (e.isFile()) {
      if (rel.startsWith(`${SELF_DIR}/`)) continue;
      if (EXTS.has(path.extname(e.name))) acc.push({ abs, rel });
    }
  }
}

// ------------------------------------------------------------------ Rôle du fichier
/** Première phrase d'un commentaire d'entête, sinon un rôle déduit du type. */
function guessRole(rel, ext, content, occ) {
  const head = content.slice(0, 2000);
  const block = head.match(/\/\*\*?([\s\S]*?)\*\//);
  if (block) {
    const text = block[1].replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ').trim();
    const sentence = text.split(/(?<=[.!?])\s/)[0];
    if (sentence && sentence.length > 8) return sentence.slice(0, 160);
  }
  const lineComments = head.match(/^(?:\s*\/\/[^\n]*\n){2,}/m);
  if (lineComments) {
    const text = lineComments[0].replace(/^\s*\/\/\s?/gm, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 8) return text.split(/(?<=[.!?])\s/)[0].slice(0, 160);
  }
  // Repli : type + export principal.
  const route = occ.find((o) => o.type === 'route');
  if (route) return `Route ${route.name}`;
  const comp = occ.find((o) => o.type === 'component');
  if (comp) return `Composant React « ${comp.name} »`;
  const table = occ.find((o) => o.type === 'table' && o.def);
  if (table) return `Table SQL « ${table.name} »`;
  const fn = occ.find((o) => o.type === 'function' && o.def);
  if (fn) return `Module — fonction principale « ${fn.name} »`;
  if (ext === '.sql') return 'Migration SQL';
  if (ext === '.css') return 'Feuille de styles';
  if (ext === '.md') return 'Documentation';
  return `Fichier ${rel.split('/').slice(0, -1).join('/') || 'racine'}`;
}

// ------------------------------------------------------------------ Extraction
function routeFromPath(rel) {
  // app/api/foo/[id]/route.ts -> POST /api/foo/[id] ; app/(app)/caisse/page.tsx -> /caisse
  if (rel.endsWith('/route.ts') || rel.endsWith('/route.tsx')) {
    let p = rel.replace(/^app/, '').replace(/\/route\.[jt]sx?$/, '');
    p = p.replace(/\/\([^)]+\)/g, ''); // retire les groupes de routes (app)
    return p || '/';
  }
  if (rel.endsWith('/page.tsx') || rel.endsWith('/page.ts')) {
    let p = rel.replace(/^app/, '').replace(/\/page\.[jt]sx?$/, '');
    p = p.replace(/\/\([^)]+\)/g, '');
    return p || '/';
  }
  return null;
}

function pushOcc(occ, o) {
  // Un extrait court et lisible pour l'UI.
  if (o.text) o.text = o.text.replace(/\s+/g, ' ').trim().slice(0, 200);
  occ.push(o);
}

function parseFile(rel, ext, content) {
  const lines = content.split('\n');
  const occ = [];
  const isTsx = ext === '.tsx' || ext === '.jsx';

  // Route / page dérivée du chemin.
  const routePath = routeFromPath(rel);
  if (routePath) {
    const methods = [...content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
      .map((m) => m[1]);
    const label = rel.includes('/route.')
      ? `${methods.join('/') || 'API'} ${routePath}`
      : routePath;
    pushOcc(occ, { line: 1, type: 'route', name: label, def: true, text: `Route ${label}` });
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = i + 1;

    // Imports.
    const imp = raw.match(/^\s*import\s+(?:type\s+)?.*?\s+from\s+['"]([^'"]+)['"]/);
    if (imp) { pushOcc(occ, { line, type: 'import', name: imp[1], text: raw }); continue; }

    // Définitions de fonctions / composants / hooks (haut niveau).
    let m = raw.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
    if (!m) m = raw.match(/^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*[:=][^=]*?=>/);
    if (!m) m = raw.match(/^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/);
    if (m) {
      const name = m[1];
      let type = 'function';
      if (/^use[A-Z]/.test(name)) type = 'hook';
      else if (isTsx && /^[A-Z]/.test(name)) type = 'component';
      pushOcc(occ, { line, type, name, def: true, text: raw });
      continue;
    }

    // Méthodes de classe / d'objet (services : `static async X(`, `async X(`,
    // `X(params): Ret {`). Indispensable ici : les services regroupent leur
    // logique en méthodes statiques (SaleService.createDraft, etc.).
    let mm = raw.match(/^\s{2,}(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+|async\s+|get\s+|set\s+)+([A-Za-z_$][\w$]*)\s*\(/);
    if (!mm) {
      const cand = raw.match(/^\s{2,}([A-Za-z_$][\w$]*)\s*\([^;{)]*\)\s*(?::\s*[^={]+)?\{\s*$/);
      if (cand) mm = cand;
    }
    if (mm && !METHOD_KEYWORDS.has(mm[1])) {
      const name = mm[1];
      const type = /^use[A-Z]/.test(name) ? 'hook' : 'function';
      pushOcc(occ, { line, type, name, def: true, text: raw });
      continue;
    }

    // Tables SQL (définition dans les migrations).
    const ct = raw.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-z0-9_]+)/i);
    if (ct) { pushOcc(occ, { line, type: 'table', name: ct[1], def: true, text: raw }); continue; }

    // Tables SQL (usage dans une requête).
    for (const um of raw.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
      const t = um[1].toLowerCase();
      if (t.length > 2 && t !== 'select') pushOcc(occ, { line, type: 'table', name: t, text: raw });
    }

    // Textes d'interface : littéraux JSX et chaînes « lisibles » (avec espace).
    if (isTsx) {
      for (const tm of raw.matchAll(/>\s*([^<>{}\n][^<>{}\n]{2,})</g)) {
        const t = tm[1].trim();
        if (/[A-Za-zÀ-ÿ]/.test(t) && !/^[\s{}()=;.,:]+$/.test(t)) {
          pushOcc(occ, { line, type: 'text', name: t.slice(0, 60), text: t });
        }
      }
    }
    for (const sm of raw.matchAll(/['"]([^'"\\]{4,80})['"]/g)) {
      const t = sm[1];
      if (/\s/.test(t) && /[A-Za-zÀ-ÿ]/.test(t) && !/[/{}<>]/.test(t) && !/^https?:/.test(t)) {
        pushOcc(occ, { line, type: 'text', name: t.slice(0, 60), text: t });
      }
    }
  }

  // Tokens de contenu (uniques) pour la recherche générale + couverture.
  const tokenSet = new Set();
  for (const t of tokenize(content)) tokenSet.add(t);
  // On borne le nombre d'occurrences « texte » pour éviter le bruit.
  const capped = [];
  let textCount = 0;
  for (const o of occ) {
    if (o.type === 'text') { if (textCount++ >= 40) continue; }
    capped.push(o);
  }

  return { occ: capped, tokens: [...tokenSet] };
}

// ------------------------------------------------------------------ Construction
/**
 * Construit l'index. `prev` (index précédent) permet une réindexation
 * INCRÉMENTALE : les fichiers non modifiés (même mtime) sont réutilisés.
 */
export function buildIndex(root, prev = null) {
  const found = [];
  walk(root, root, found);
  const files = {};
  for (const { abs, rel } of found) {
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    const prevEntry = prev?.files?.[rel];
    if (prevEntry && prevEntry.mtimeMs === stat.mtimeMs) {
      files[rel] = prevEntry;
      continue;
    }
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (content.length > 400_000) content = content.slice(0, 400_000); // fichiers énormes bornés
    const ext = path.extname(rel);
    const { occ, tokens } = parseFile(rel, ext, content);
    files[rel] = {
      rel,
      name: rel.split('/').pop(),
      dir: rel.split('/').slice(0, -1).join('/'),
      ext,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      lineCount: content.split('\n').length,
      role: guessRole(rel, ext, content, occ),
      occ,
      tokens,
    };
  }
  return {
    root,
    indexedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files,
  };
}

/**
 * Dérive les index inversés en mémoire (non stockés dans le cache) :
 *   - post        : token -> [{ rel, occIdx }] pour les occurrences structurées
 *   - contentPost : token -> Set(rel) pour la recherche de contenu
 */
export function derivePostings(index) {
  const post = new Map();
  const contentPost = new Map();
  for (const rel of Object.keys(index.files)) {
    const f = index.files[rel];
    f.occ.forEach((o, occIdx) => {
      for (const tk of tokenize(`${o.name} ${o.type}`)) {
        if (!post.has(tk)) post.set(tk, []);
        post.get(tk).push({ rel, occIdx });
      }
    });
    for (const tk of f.tokens) {
      if (!contentPost.has(tk)) contentPost.set(tk, new Set());
      contentPost.get(tk).add(rel);
    }
  }
  return { post, contentPost };
}
