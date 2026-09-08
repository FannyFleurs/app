// CodeMap — moteur de recherche et de pertinence, + mode « Où modifier ? ».
// 100 % local et heuristique. Le point d'entrée resolveWhere() est conçu comme
// un POINT D'EXTENSION : un futur « mode IA » optionnel s'y branche via
// registerResolver('ai', fn) sans réécrire le reste de l'outil.
import fs from 'node:fs';
import path from 'node:path';
import { tokenize, normalizeText } from './indexer.mjs';
import { expandQuery, classifyFile, CLUSTERS, detectQuerySides, sideCounts } from './lexicon.mjs';

const TYPE_WEIGHT = {
  route: 5, table: 5, component: 5, function: 5, hook: 5, text: 4, import: 2, comment: 1,
};
const DEF_BONUS = 3;      // les DÉFINITIONS priment sur les appels/imports
const CONTENT_WEIGHT = 1.5;
const FILENAME_WEIGHT = 6;
const PATH_WEIGHT = 3;

const CLUSTER_LABEL = Object.fromEntries(CLUSTERS.map((c) => [c.id, c.label]));

// Mots vides (FR/EN) — surtout utiles au mode « Où modifier ? » : « je veux
// modifier la page de connexion » -> [page, connexion]. On garde les termes
// métier (page, ticket…).
const STOPWORDS = new Set([
  'je', 'tu', 'il', 'on', 'nous', 'vous', 'me', 'ma', 'mon', 'mes', 'la', 'le', 'les',
  'un', 'une', 'des', 'du', 'de', 'dans', 'sur', 'pour', 'avec', 'sans', 'ou', 'et',
  'veux', 'veut', 'veu', 'souhaite', 'souhait', 'voudrais', 'aimerais', 'comment',
  'modifier', 'modifie', 'changer', 'editer', 'edite',
  'faire', 'ce', 'cette', 'ces', 'quand', 'que', 'qui', 'est', 'lorsque', 'lorsqu',
  // Mots d'interface génériques (non discriminants) : la fenêtre, l'affichage…
  'fenetre', 'fenetres', 'modale', 'popup', 'affiche', 'afficher', 'affichage',
  'saisit', 'saisir', 'saisie', 'vendeur', 'vendeuse', 'ecran',
  'i', 'want', 'to', 'the', 'a', 'an', 'change', 'modify', 'edit', 'my', 'in', 'on', 'for',
]);

/** Recherche principale. Renvoie une liste de résultats triés par pertinence. */
export function search(ctx, rawQuery, { limit = 40 } = {}) {
  const { index, post, contentPost } = ctx;
  const allTokens = tokenize(rawQuery);
  const filtered = allTokens.filter((t) => !STOPWORDS.has(t));
  const qTokens = filtered.length ? filtered : allTokens; // ne jamais tout vider
  if (qTokens.length === 0) return { results: [], query: rawQuery, tokens: [] };
  const original = new Set(qTokens);
  const { tokens: expanded, clusters } = expandQuery(qTokens);
  const extra = new Set([...expanded].filter((t) => !original.has(t)));
  const normQuery = normalizeText(rawQuery).trim();
  const multi = qTokens.length > 1;
  // Requête = un seul identifiant (nom exact de fonction/table/composant) ?
  const exactName = /^[A-Za-z_$][\w$.]*$/.test(rawQuery.trim())
    ? normalizeText(rawQuery.trim()) : null;
  // Chemins des fonctionnalités déclenchées par le lexique (ex. connexion -> login/auth).
  const clusterPaths = [];
  for (const c of clusters) for (const p of c.paths) clusterPaths.push(p);

  // IDF : un mot présent partout (« caisse ») est peu discriminant ; un mot rare
  // (« ouverture », « fond », « remboursement ») l'est beaucoup. On pondère
  // TOUTES les contributions par l'IDF du mot → le moteur ne « compte » plus les
  // correspondances, il valorise les mots qui distinguent réellement la requête.
  const N = index.fileCount || 1;
  const idfCache = new Map();
  const idf = (t) => {
    if (idfCache.has(t)) return idfCache.get(t);
    const df = contentPost.get(t)?.size ?? 0;
    const v = Math.log(1 + N / (df + 1)); // ~0.7 (très commun) … ~6.5 (rare)
    idfCache.set(t, v);
    return v;
  };
  // Intention (aspects opposés) exprimée par la requête.
  const desired = detectQuerySides([...original]);
  const desiredAspects = Object.values(desired);

  // Fichiers candidats : union des postings (structurés + contenu).
  const candidates = new Set();
  for (const t of [...original, ...extra]) {
    for (const p of post.get(t) ?? []) candidates.add(p.rel);
    for (const rel of contentPost.get(t) ?? []) candidates.add(rel);
  }

  const scored = [];
  for (const rel of candidates) {
    const f = index.files[rel];
    if (!f) continue;
    let score = 0;
    const covered = new Set();
    const matches = [];
    const nameTokens = new Set(tokenize(f.name));
    const pathTokens = new Set(tokenize(rel));
    const fileSet = new Set(f.tokens);

    // Contributions pondérées par IDF (nom de fichier / chemin / contenu).
    for (const t of original) {
      const w = idf(t);
      if (nameTokens.has(t)) { score += FILENAME_WEIGHT * w; covered.add(t); }
      if (pathTokens.has(t)) { score += PATH_WEIGHT * w; covered.add(t); }
      if (fileSet.has(t)) { score += CONTENT_WEIGHT * w; covered.add(t); }
    }
    for (const t of extra) {
      if (fileSet.has(t)) score += CONTENT_WEIGHT * 0.35 * idf(t);
    }

    // Bonus « bonne zone » (fonctionnalité déduite). Modéré : l'intention (ci-dessous) affine.
    const relLower = rel.toLowerCase();
    if (clusterPaths.some((p) => relLower.includes(p))) score += 6;

    // Occurrences structurées (définitions mises en avant, pondérées IDF).
    // Anti-volume : on ne SOMME pas toutes les occurrences (un fichier bavard,
    // avec 30 textes contenant « caisse », gonflait artificiellement). On somme
    // les meilleures DÉFINITIONS (peu nombreuses, signifiantes) et on ne garde
    // que la MEILLEURE occurrence non-définition par type.
    const defW = [];
    const bestNonDef = new Map();
    for (const o of f.occ) {
      const on = tokenize(`${o.name}`);
      const hitTok = on.filter((x) => original.has(x));
      const hitOrig = hitTok.length > 0;
      const hitExtra = !hitOrig && on.some((x) => extra.has(x));
      if (!hitOrig && !hitExtra) continue;
      const wIdf = hitOrig ? Math.max(...hitTok.map(idf)) : 0.6;
      let w = ((TYPE_WEIGHT[o.type] ?? 1) + (o.def ? DEF_BONUS : 0)) * wIdf;
      if (exactName && o.def && normalizeText(o.name) === exactName) w += 25;
      if (o.def) defW.push(w);
      else bestNonDef.set(o.type, Math.max(bestNonDef.get(o.type) ?? 0, w));
      for (const x of hitTok) covered.add(x);
      if (matches.length < 12) {
        matches.push({ type: o.type, name: o.name, line: o.line, text: o.text, def: !!o.def, weight: w });
      }
    }
    defW.sort((a, b) => b - a);
    for (const w of defW.slice(0, 4)) score += w;         // au plus 4 définitions
    for (const w of bestNonDef.values()) score += w;       // 1 par type (texte, import…)

    if (score <= 0) continue;

    // Couverture des mots de la requête (préférence forte au « tout couvrir »).
    const coverage = covered.size / original.size;
    score *= 0.5 + coverage;

    // Expression exacte trouvée (rôle, extraits, nom de fichier).
    if (multi && normQuery.length >= 4) {
      const hay = `${normalizeText(f.name)} ${normalizeText(f.role)} ${matches.map((m) => normalizeText(m.text || m.name)).join(' ')}`;
      if (hay.includes(normQuery)) score += 6;
    }

    // ---- Intention (aspects opposés) : bonus si le fichier est du bon côté,
    //      pénalité s'il appartient clairement au côté OPPOSÉ. Générique.
    //  Le signal le plus fort est l'IDENTITÉ du fichier : un fichier dont le NOM
    //  ou le CHEMIN est le concept opposé (« ClosuresAdmin », .../closures/…)
    //  est fortement rétrogradé pour une requête sur le concept demandé.
    let penalty = 1;
    for (const { aspect, side } of desiredAspects) {
      const sideTokens = aspect.sides[side];
      const otherTokens = new Set();
      for (const [k, s] of Object.entries(aspect.sides)) if (k !== side) for (const t of s) otherTokens.add(t);

      const inName = (set) => [...set].some((t) => t.length >= 4 && (nameTokens.has(t) || pathTokens.has(t)));
      // L'IDENTITÉ (nom de fichier / chemin) prime : un symbole interne du côté
      // demandé (ex. « openingFloat » dans la page de clôture) donne un bonus
      // mais NE protège PAS un fichier dont l'identité est le concept opposé.
      const desiredInPath = inName(sideTokens);
      const desiredInDef = f.occ.some((o) => o.def && tokenize(o.name).some((x) => sideTokens.has(x)));
      const oppositeInPath = inName(otherTokens);

      const counts = sideCounts(fileSet, aspect);
      const d = counts[side] || 0;
      let opp = 0;
      for (const [k, v] of Object.entries(counts)) if (k !== side) opp = Math.max(opp, v);

      if (desiredInPath) score += 18;              // le fichier EST du bon concept (nom/chemin)
      else if (desiredInDef) score += 10;          // une définition du bon concept
      if (d > 0) score += 6 + 3 * Math.min(3, d);  // il en parle dans son contenu

      if (oppositeInPath && !desiredInPath) penalty = Math.min(penalty, 0.2);            // identité opposée
      else if (opp >= 3 && opp >= d * 2 && !desiredInPath && !desiredInDef) penalty = Math.min(penalty, 0.4); // contenu opposé dominant
    }
    score *= penalty;

    // Les définitions d'abord dans les extraits affichés.
    matches.sort((a, b) => (b.def - a.def) || (b.weight - a.weight) || (a.line - b.line));

    scored.push({
      rel, name: f.name, dir: f.dir, role: f.role, ext: f.ext,
      mtimeMs: f.mtimeMs, coverage, score,
      clusters: classifyFile(f),
      matches: matches.slice(0, 6),
    });
  }

  scored.sort((a, b) =>
    (b.score - a.score) || (b.coverage - a.coverage) || (a.rel < b.rel ? -1 : 1));

  const top = scored.slice(0, limit);
  // Extraits pour les fichiers trouvés seulement par le contenu (pas d'occ).
  for (const r of top) {
    if (r.matches.length === 0) r.matches = contentSnippets(index.root, r.rel, original);
    r.why = buildWhy(r);
    const max = top[0].score || 1;
    r.relevance = Math.max(1, Math.round((r.score / max) * 100));
    r.relevanceLabel = r.relevance >= 66 ? 'Élevée' : r.relevance >= 33 ? 'Moyenne' : 'Faible';
    r.clusterLabels = r.clusters.map((c) => CLUSTER_LABEL[c] ?? c);
  }
  return { results: top, query: rawQuery, tokens: qTokens };
}

function contentSnippets(root, rel, tokens) {
  try {
    const lines = fs.readFileSync(path.join(root, rel), 'utf8').split('\n');
    const out = [];
    for (let i = 0; i < lines.length && out.length < 3; i++) {
      const lt = new Set(tokenize(lines[i]));
      if ([...tokens].some((t) => lt.has(t))) {
        out.push({ type: 'content', name: '', line: i + 1, text: lines[i].trim().slice(0, 200), def: false });
      }
    }
    return out;
  } catch { return []; }
}

function buildWhy(r) {
  const kinds = new Set(r.matches.map((m) => TYPE_FR[m.type] ?? m.type));
  const hasDef = r.matches.some((m) => m.def);
  const parts = [];
  if (r.matches.some((m) => m.type === 'route')) parts.push('route/API');
  if (hasDef) parts.push('définition');
  for (const k of kinds) if (parts.length < 4 && !parts.includes(k)) parts.push(k);
  return parts.length ? `Correspond par : ${parts.join(', ')}.` : 'Correspondance dans le contenu.';
}

export const TYPE_FR = {
  route: 'route', table: 'table', component: 'composant', function: 'fonction',
  hook: 'hook', text: 'texte', import: 'import', comment: 'commentaire', content: 'contenu',
};

// ---------------------------------------------------------------- « Où modifier ? »
const resolvers = {};
export function registerResolver(name, fn) { resolvers[name] = fn; }

/**
 * Résout une demande en langage naturel → fichiers à modifier, regroupés.
 * provider 'heuristic' (défaut, local). Un provider 'ai' pourra être enregistré
 * plus tard via registerResolver('ai', fn) et recevra (query, ctx, base) où
 * `base` est déjà le résultat heuristique — il n'a qu'à l'affiner.
 */
export async function resolveWhere(ctx, rawQuery, { provider = 'heuristic' } = {}) {
  const base = heuristicWhere(ctx, rawQuery);
  if (provider !== 'heuristic' && resolvers[provider]) {
    return resolvers[provider](ctx, rawQuery, base);
  }
  return base;
}

function heuristicWhere(ctx, rawQuery) {
  const { results } = search(ctx, rawQuery, { limit: 30 });
  const principal = results.slice(0, 2);
  const principalRels = new Set(principal.map((r) => r.rel));
  const associes = results.filter((r) => !principalRels.has(r.rel)
    && !(r.ext === '.sql')).slice(0, 6);
  const usedRels = new Set([...principalRels, ...associes.map((r) => r.rel)]);
  // Base / SQL : migrations, routes API et fichiers portant des tables.
  const base = results.filter((r) =>
    r.ext === '.sql'
    || r.rel.startsWith('app/api/')
    || r.matches.some((m) => m.type === 'table' || m.type === 'route'))
    .filter((r) => !usedRels.has(r.rel) || r.ext === '.sql' || r.rel.startsWith('app/api/'))
    .slice(0, 6);

  const { clusters } = expandQuery(tokenize(rawQuery));
  return {
    query: rawQuery,
    principal, associes, base,
    clusters: [...clusters].map((c) => c.label),
    provider: 'heuristic',
  };
}

/** Carte Architecture : sections structurelles + clusters fonctionnels. */
export function architecture(ctx) {
  const { index } = ctx;
  const sections = {
    pages: [], api: [], components: [], services: [], settings: [],
    hooks: [], migrations: [], utils: [],
  };
  const clusters = Object.fromEntries(CLUSTERS.map((c) => [c.id, { id: c.id, label: c.label, count: 0, files: [] }]));

  for (const rel of Object.keys(index.files)) {
    const f = index.files[rel];
    if (rel.endsWith('/page.tsx') || rel.endsWith('/page.ts')) sections.pages.push(rel);
    else if (rel.startsWith('app/api/') && rel.endsWith('/route.ts')) sections.api.push(rel);
    else if (rel.startsWith('components/')) sections.components.push(rel);
    else if (rel.startsWith('lib/services/')) sections.services.push(rel);
    else if (rel.startsWith('lib/settings/') || rel.includes('/settings/')) sections.settings.push(rel);
    else if (rel.startsWith('migrations/')) sections.migrations.push(rel);
    else if (f.occ.some((o) => o.type === 'hook' && o.def)) sections.hooks.push(rel);
    else if (rel.startsWith('lib/')) sections.utils.push(rel);

    for (const cid of classifyFile(f)) {
      if (clusters[cid]) { clusters[cid].count++; if (clusters[cid].files.length < 200) clusters[cid].files.push(rel); }
    }
  }
  const sectionCounts = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length]));
  return {
    sections, sectionCounts,
    clusters: Object.values(clusters).filter((c) => c.count > 0).sort((a, b) => b.count - a.count),
  };
}
