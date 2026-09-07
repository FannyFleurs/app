// CodeMap — lexique de domaine (HelloPos). Sert au mode « Où modifier ? » et au
// regroupement par fonctionnalité de la carte Architecture. Fait le pont entre
// le vocabulaire métier (souvent FR) et le vocabulaire technique du code (EN) :
// « clôture caisse » -> close, register, cloture, z, seal, daily…
//
// Chaque cluster = une fonctionnalité, avec : des mots-clés (déclencheurs), des
// tokens techniques associés (pour l'expansion de requête) et des indices de
// chemin (pour classer les fichiers). Volontairement en données pures, faciles
// à enrichir sans toucher au moteur.
import { tokenize } from './indexer.mjs';

export const CLUSTERS = [
  {
    id: 'impression', label: 'Impression / Tickets',
    keywords: ['impression', 'imprimer', 'ticket', 'recu', 'reçu', 'print', 'receipt', 'imprimante', 'printer'],
    tokens: ['print', 'receipt', 'ticket', 'cloudprnt', 'star', 'drawer', 'printer', 'label', 'starprnt'],
    paths: ['services/cloudprnt', 'receipt', 'print', 'label'],
  },
  {
    id: 'caisse', label: 'Caisse / Clôture / Espèces',
    keywords: ['caisse', 'cloture', 'clôture', 'fermeture', 'ouverture', 'comptage', 'especes', 'espèces', 'fond', 'tiroir', 'session', 'z', 'journee', 'journée'],
    tokens: ['cash', 'register', 'session', 'close', 'closing', 'closure', 'daily', 'seal', 'drawer', 'float', 'counted', 'denomination', 'cloture', 'zreport'],
    paths: ['caisse', 'closures', 'cash-session', 'ma-journee'],
  },
  {
    id: 'vente', label: 'Ventes / Panier',
    keywords: ['vente', 'ventes', 'panier', 'encaissement', 'ligne', 'rendu', 'monnaie'],
    tokens: ['sale', 'sales', 'cart', 'line', 'validate', 'draft', 'change', 'given', 'checkout', 'receipt'],
    paths: ['sale', 'caisse', 'sales'],
  },
  {
    id: 'paiement', label: 'Paiements / Stripe',
    keywords: ['paiement', 'payer', 'reglement', 'règlement', 'stripe', 'cb', 'carte', 'lien'],
    tokens: ['payment', 'pay', 'stripe', 'checkout', 'card', 'method', 'link', 'refund'],
    paths: ['payment', 'stripe', 'billing'],
  },
  {
    id: 'remboursement', label: 'Remboursements / Avoirs',
    keywords: ['remboursement', 'rembourser', 'avoir', 'avoirs', 'retour', 'annulation', 'demarque', 'démarque'],
    tokens: ['refund', 'credit', 'note', 'return', 'cancel', 'voucher', 'giftcard', 'loss'],
    paths: ['refund', 'credit-note', 'return', 'vouchers'],
  },
  {
    id: 'auth', label: 'Authentification / Connexion',
    keywords: ['connexion', 'login', 'authentification', 'auth', 'pin', 'mot de passe', 'session', 'deconnexion'],
    tokens: ['auth', 'login', 'pin', 'session', 'password', 'signin', 'logout', 'cookie', 'jwt', 'jose'],
    paths: ['auth', 'login', 'pin-login'],
  },
  {
    id: 'tva', label: 'TVA / Taxes',
    keywords: ['tva', 'taxe', 'taxes', 'taux'],
    tokens: ['tax', 'vat', 'rate', 'tva', 'breakdown'],
    paths: ['tax'],
  },
  {
    id: 'clients', label: 'Clients / Fidélité',
    keywords: ['client', 'clients', 'fidelite', 'fidélité', 'compte', 'loyalty'],
    tokens: ['customer', 'client', 'loyalty', 'points', 'account', 'balance'],
    paths: ['customer', 'loyalty'],
  },
  {
    id: 'stock', label: 'Stock / Inventaire',
    keywords: ['stock', 'inventaire', 'mouvement', 'demarque', 'démarque', 'perte', 'transfert'],
    tokens: ['stock', 'inventory', 'movement', 'loss', 'adjustment', 'transfer', 'level', 'shrinkage'],
    paths: ['stock', 'inventor'],
  },
  {
    id: 'produits', label: 'Produits / Catalogue',
    keywords: ['produit', 'produits', 'catalogue', 'article', 'categorie', 'catégorie', 'prix', 'code barre', 'ean'],
    tokens: ['product', 'catalog', 'category', 'price', 'barcode', 'ean', 'sku'],
    paths: ['product', 'categor', 'pricing', 'label'],
  },
  {
    id: 'parametres', label: 'Paramètres / Entreprise',
    keywords: ['parametre', 'paramètre', 'reglage', 'réglage', 'entreprise', 'societe', 'société', 'organisation', 'configuration', 'facturation'],
    tokens: ['settings', 'setting', 'organization', 'company', 'billing', 'branding', 'config'],
    paths: ['settings', 'admin/configuration', 'admin/organizations'],
  },
  {
    id: 'commandes', label: 'Commandes / Écran & Livraison',
    keywords: ['commande', 'commandes', 'livraison', 'ecran', 'écran', 'retrait'],
    tokens: ['order', 'orders', 'delivery', 'screen', 'incoming', 'pickup'],
    paths: ['orders', 'screen-delivery', 'ecran'],
  },
  {
    id: 'rapports', label: 'Rapports / Exports',
    keywords: ['rapport', 'rapports', 'export', 'exports', 'statistique', 'ca', 'chiffre affaires'],
    tokens: ['report', 'reports', 'export', 'summary', 'dashboard'],
    paths: ['reports', 'exports', 'ca'],
  },
];

const KEYWORD_INDEX = (() => {
  const map = new Map(); // token normalisé -> Set(cluster)
  for (const c of CLUSTERS) {
    for (const kw of c.keywords) {
      for (const tk of tokenize(kw)) {
        if (!map.has(tk)) map.set(tk, new Set());
        map.get(tk).add(c);
      }
    }
    for (const tk of c.tokens.flatMap((t) => tokenize(t))) {
      if (!map.has(tk)) map.set(tk, new Set());
      map.get(tk).add(c);
    }
  }
  return map;
})();

/**
 * Étend une liste de tokens de requête avec le vocabulaire technique des
 * clusters déclenchés. Renvoie { tokens: Set, clusters: Set }.
 * `tokens` inclut les tokens d'origine + les tokens techniques associés.
 */
export function expandQuery(queryTokens) {
  const tokens = new Set(queryTokens);
  const clusters = new Set();
  for (const qt of queryTokens) {
    const cs = KEYWORD_INDEX.get(qt);
    if (!cs) continue;
    for (const c of cs) {
      clusters.add(c);
      for (const t of c.tokens) for (const tk of tokenize(t)) tokens.add(tk);
    }
  }
  return { tokens, clusters };
}

/** Cluster(s) fonctionnel(s) d'un fichier, d'après son chemin et ses tokens. */
export function classifyFile(fileRecord) {
  const rel = fileRecord.rel.toLowerCase();
  const hits = new Set();
  for (const c of CLUSTERS) {
    if (c.paths.some((p) => rel.includes(p))) hits.add(c.id);
  }
  if (hits.size === 0) {
    // Repli par tokens dominants du fichier.
    const toks = new Set(fileRecord.tokens);
    for (const c of CLUSTERS) {
      if (c.tokens.some((t) => toks.has(t))) { hits.add(c.id); break; }
    }
  }
  return [...hits];
}
