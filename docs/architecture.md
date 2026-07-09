# Architecture HelloPos

## Couches

```
┌──────────────────────────────────────────────┐
│ UI (Next.js App Router, Tailwind)            │
│   - pages back-office authentifiées          │
│   - écran caisse PWA-ready                   │
└────────────┬─────────────────────────────────┘
             │ fetch JSON
┌────────────▼─────────────────────────────────┐
│ API routes (lib/auth/guards.ts en front)     │
│   - validation zod, RBAC, audit              │
└────────────┬─────────────────────────────────┘
             │ appelle
┌────────────▼─────────────────────────────────┐
│ Services métier (lib/services)               │
│   SaleService · ClosingService               │
│   CashSessionService · ProductService        │
│   MoneyService · ReceiptPDFService           │
└────────────┬─────────────────────────────────┘
             │ utilise
┌────────────▼─────────────────────────────────┐
│ FiscalCore (lib/fiscal)                      │
│   recordEvent · nextDocumentNumber           │
│   verifyChain                                │
└────────────┬─────────────────────────────────┘
             │ via pg pool, dans une transaction
┌────────────▼─────────────────────────────────┐
│ PostgreSQL                                   │
│   - triggers append-only                     │
│   - contraintes d'intégrité                  │
│   - indices                                  │
└──────────────────────────────────────────────┘
```

## Règle d'or

**Toute écriture fiscalement sensible** (vente validée, facture validée,
clôture, paiement) est exécutée :

1. dans une transaction unique (`withTransaction`),
2. via un service métier (jamais directement dans une route),
3. avec un appel à `FiscalCore.recordEvent()` dans la même transaction,
4. après une réservation atomique de la séquence si applicable.

Si l'une de ces étapes échoue, **tout est annulé** : pas de demi-écriture
possible.

## Multi-tenant

Toutes les tables métier portent `organization_id`. Chaque requête SQL
filtre explicitement par `organization_id` issu de la session.
Les `users.email` sont uniques **par organisation** (pas globalement),
ce qui permet à un même email d'exister dans plusieurs organisations
(cas multi-franchise).

> Lorsque le projet sera déployé sur Supabase, on pourra activer le RLS
> (Row Level Security) avec une politique `organization_id = current_setting('app.org')::uuid`
> définie via `SET LOCAL` au début de chaque transaction.

## Données figées

À la validation d'une vente, on figue un **snapshot JSONB complet** dans
`receipts.snapshot`. Tout retraitement futur (re-impression, archive,
export contrôle fiscal) lit ce snapshot — jamais les tables vivantes —
afin que la pièce reste lisible même si un libellé produit a été modifié
ultérieurement.

## Offline

L'architecture prévoit un mode offline (file d'attente locale chiffrée +
synchronisation au retour réseau + numérotation temporaire) mais
**ne l'implémente pas en Phase 1**. Cela évite de casser la séquence
fiscale tant que la stratégie de scellement asynchrone n'est pas validée
juridiquement.

## Sécurité — synthèse

- Cookies `httpOnly` + `SameSite=Lax` (et `Secure` en prod)
- Headers durcis dans `next.config.mjs`
- bcrypt 12 rounds pour les mots de passe
- Verrouillage de compte après 8 tentatives (15 min)
- JWT HS256 + token_hash en base (révocable indépendamment)
- Aucune clé secrète envoyée au client
- Validation zod côté serveur sur toutes les routes
- Permissions vérifiées côté serveur (le frontend ne fait que masquer)
- Triggers Postgres comme dernière ligne de défense
