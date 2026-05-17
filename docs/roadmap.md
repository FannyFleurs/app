# Roadmap

## Phase 1 — Socle (livré)

- Auth + RBAC 7 rôles
- Organisations / boutiques / caisses
- Catalogue produits + catégories + TVA
- Caisse : panier, prix libre, paiements multiples, ticket PDF, mise en attente
- FiscalCore : hash chain, séquences, cumul perpétuel
- Sessions de caisse (ouverture/clôture)
- Clôture journalière scellée
- Audit applicatif + audit fiscal séparés
- UI : Dashboard, Caisse, Produits, Catégories, Clôtures, Conformité, Utilisateurs (lecture), Paramètres (lecture)

## Phase 2 — Gestion étendue

- Stock & inventaires (entrées, sorties, ajustements, pertes, transferts)
- Clients (CRM, adresses, consentements RGPD, anonymisation)
- Fidélité (config règles, mouvements, expiration)
- Factures B2C / B2B / proforma / acompte / solde
- Avoirs
- Cartes cadeaux (émission, utilisation)
- Commandes clients (bouquets, compositions, dates futures, acomptes)
- Champs RGPD + export données client

## Phase 3 — Conformité renforcée

- Clôtures mensuelles + annuelles
- Archives fiscales (paquets JSONL signés + PDF de contrôle)
- Export contrôle fiscal complet par période
- Rapport d'intégrité PDF
- Signature horodatée externe (RFC 3161)
- Stockage à valeur probante (NF Z42-013 ready)

## Phase 4 — Avancé

- Multi-boutique avancé : transferts, reporting consolidé, droits par boutique
- Livraisons : tournées, créneaux, statuts, preuve
- Statistiques : tableaux de bord enrichis, ventes par catégorie/vendeur/heure
- Comptabilité : exports CSV + écritures par compte
- Facturation électronique : Factur-X / UBL / CII, connecteurs PDP/PPF
- Intégrations : Stripe, SumUp, imprimantes, TPE, scanners, afficheur client
- API publique sécurisée
- Mode offline complet + synchronisation
- 2FA TOTP
