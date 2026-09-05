# HelloPos

**Caisse SaaS moderne pour commerce.**
Conçue *certification-ready* par rapport aux exigences françaises applicables aux
systèmes de caisse (art. 286, I, 3°bis du CGI : inaltérabilité, sécurisation,
conservation, archivage).

> ⚠ **Aucune certification n'est revendiquée par cette simple base de code.**
> Le logiciel est conçu pour permettre, à terme :
> - une attestation individuelle éditeur,
> - une démarche NF525 / LNE ou équivalent,
> - une revue par expert-comptable, avocat fiscaliste ou organisme compétent.
> Les éléments techniques requis sont en place (voir `docs/conformite.md`).

## Stack

- **Frontend & API** : Next.js 14 (App Router) + TypeScript + Tailwind
- **Base** : PostgreSQL 15+ (triggers Postgres pour append-only)
- **Auth** : sessions HTTP-only + JWT HS256 (jose), bcrypt
- **Fiscal** : `FiscalCore` (hash chain SHA-256 / HMAC, séquences sans rupture)
- **PDF** : pdfkit pour les tickets
- **Tests** : Vitest

## Démarrage

```bash
# 1. Installer
npm install

# 2. Configurer .env.local (générer SESSION_SECRET et FISCAL_SIGNING_KEY)
cp .env.example .env.local
openssl rand -hex 32   # à coller dans SESSION_SECRET
openssl rand -hex 32   # à coller dans FISCAL_SIGNING_KEY

# 3. Préparer Postgres
createdb webpos
# (ou via Docker : docker run -p 5432:5432 -e POSTGRES_PASSWORD=webpos -e POSTGRES_USER=webpos -e POSTGRES_DB=webpos postgres:15)

# 4. Migrer + seed
npm run db:migrate
npm run db:seed

# 5. Lancer
npm run dev
# http://localhost:3000

# Comptes de démonstration (mot de passe : HelloPos2026!) :
# owner@webpos.test, manager@webpos.test, vendeur@webpos.test, comptable@webpos.test
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build production |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm run db:migrate` | Applique les migrations SQL (idempotent + intégrité) |
| `npm run db:seed` | Crée une organisation de démo + produits fleuristes |
| `npm run db:reset` | DROP + reset (destructif, dev uniquement) |
| `npm run fiscal:verify` | Vérifie l'intégrité de la chaîne fiscale |
| `npm test` | Exécute la suite Vitest |

## Architecture en bref

```
app/
  (app)/...           # back-office authentifié
  caisse/             # interface caisse principale
  api/                # routes API (auth, products, sales, closures, fiscal)
components/           # UI réutilisable
lib/
  db/                 # pool pg + runner de migrations versionnées
  fiscal/             # FiscalCore (cœur d'inaltérabilité)
  services/           # SaleService, ClosingService, CashSessionService, PDF
  auth/               # RBAC, sessions, mots de passe
  audit/              # journal applicatif
migrations/           # SQL pur, immuable une fois appliqué
tests/                # unitaires (Vitest)
scripts/              # CLI internes (migrate, seed, verify-fiscal-chain)
docs/                 # conformité, checklists, architecture
```

## Phase 1 — implémentée

- Auth + RBAC 7 rôles
- Multi-tenant (organisations / boutiques / caisses)
- Catalogue : produits + catégories + taux TVA + historique prix
- Caisse : panier, prix libre (bouquet), recherche, code-barres,
  mise en attente, paiement multi-moyens, rendu monnaie, ticket PDF
- **FiscalCore** : hash chain SHA-256/HMAC, séquences sans rupture,
  cumul perpétuel, événements append-only protégés par trigger Postgres
- Session de caisse (ouverture/clôture)
- Clôture journalière scellée
- Audit applicatif append-only
- Vérification d'intégrité de la chaîne (UI + script)
- Triggers SQL d'immutabilité sur ventes / factures / clôtures / paiements

## Phases suivantes

Voir `docs/roadmap.md` pour le détail des Phases 2 (stock/clients/fidélité/factures),
3 (clôtures mensuelles/annuelles, archives, exports contrôle fiscal) et 4
(multi-boutique, livraisons, comptabilité, facturation électronique).

## Conformité

Voir `docs/conformite.md` pour la checklist détaillée et les références juridiques.
