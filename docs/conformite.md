# Conformité fiscale — dossier technique

Ce document décrit, fonction par fonction, les mécanismes mis en place dans
Webpos pour satisfaire aux exigences françaises applicables aux systèmes
de caisse (article 286, I, 3°bis du CGI ; BOI-TVA-DECLA-30-10-30 ; principes
inspirés de la norme NF525).

**À noter :** ce document décrit les mécanismes en place. Il **ne constitue pas**
une attestation de certification. Une attestation individuelle éditeur ou une
certification par organisme habilité (LNE, AFNOR/NF) reste à effectuer.

---

## 1. Inaltérabilité

| Exigence | Implémentation |
|---|---|
| Aucune modification après validation | Trigger `fn_protect_validated_sale` interdit la modification des champs fiscaux d'une vente validée. Trigger équivalent pour `invoices`. |
| Append-only sur événements fiscaux | Trigger `fn_block_update_delete` posé sur `fiscal_events`, `audit_logs`, `daily_closures`, `monthly_closures`, `yearly_closures`, `receipts`, `payments`, `product_price_history`, `stock_movements`, `loyalty_movements`, `gift_card_movements`, `fiscal_archives`. |
| Hash chaîné | Chaque ligne de `fiscal_events` contient `previous_hash` + `current_hash` ; le hash est SHA-256 sur `previous_hash | immutable_index | event_type | canonical(payload)`, optionnellement signé HMAC-SHA256 avec `FISCAL_SIGNING_KEY`. |
| Index séquentiel sans rupture | `fiscal_chain_state.next_index` incrémenté sous `FOR UPDATE` dans la même transaction que l'écriture de l'événement. |
| Numérotation tickets / factures sans rupture | Table `document_sequences` avec lock atomique, séquence par organisation × kind × année (rotation annuelle). |
| Cumul perpétuel TTC (grand total) | `fiscal_chain_state.grand_total_ttc` mis à jour à chaque vente, conservé dans le payload de chaque événement (`_meta.previous_grand_total_ttc`, `_meta.new_grand_total_ttc`). |

## 2. Sécurisation

| Exigence | Implémentation |
|---|---|
| Authentification | Sessions HTTP-only, JWT HS256 signé avec `SESSION_SECRET`, `token_hash` côté serveur (révocable). |
| Mots de passe | bcrypt 12 rounds. |
| Brute force | Verrouillage du compte après 8 tentatives échouées pendant 15 min. |
| Rôles | RBAC à 7 niveaux + permissions granulaires (voir `lib/auth/rbac.ts`). Aucun rôle ne dispose de la permission `pos.void_validated_sale`. |
| Cookies | `httpOnly`, `sameSite=lax`, `secure` en production. |
| Headers | X-Frame-Options DENY, nosniff, Referrer-Policy strict-origin, Permissions-Policy restrictive. |
| Audit | Connexions, échecs, actions sensibles : `audit_logs` (append-only). |
| Secrets | Jamais en frontend ; clé fiscale isolée de la clé de session. |
| Validation | Toutes les routes utilisent `zod` côté serveur. |

## 3. Conservation

| Exigence | Implémentation |
|---|---|
| Conservation 6 ans | Aucune suppression possible ; la rétention est garantie par la base. Une politique d'archivage extérieure (sauvegardes) doit compléter ce dispositif. |
| Données pièces fiscales conservées même après demande RGPD | Le champ `is_anonymized` sur `customers` permet l'anonymisation, mais les pièces fiscales (`sales`, `receipts`, `invoices`) conservent leur snapshot complet. |
| Snapshot des tickets | `receipts.snapshot` (JSONB) contient l'état figé de la vente au moment du scellement. |
| Historique prix produit | `product_price_history` append-only conserve chaque changement avec auteur et raison. |

## 4. Archivage

| Exigence | Implémentation |
|---|---|
| Archives périodiques | Table `fiscal_archives` (Phase 3) prévue pour stocker des paquets journaliers / mensuels / annuels signés (sha256 + chemin fichier). |
| Format vérifiable | JSONL + manifest sha256 + PDF de contrôle. |
| Export contrôle fiscal | Écran "Conformité" + commande `npm run fiscal:verify`. |

## 5. Traçabilité

| Exigence | Implémentation |
|---|---|
| Journal d'événements fiscaux | `fiscal_events` (append-only, hash chaîné). |
| Journal applicatif | `audit_logs` séparé (append-only). |
| Traçabilité des prix | `product_price_history` (auteur, ancien/nouveau prix, raison). |
| Traçabilité des mouvements stock / fidélité / cartes cadeaux | Toutes les tables `*_movements` sont append-only. |
| Traçabilité des corrections | Les corrections passent par avoirs (`credit_notes`) liés à la vente d'origine — pas de suppression. |

## 6. Clôtures

| Type | État Phase 1 |
|---|---|
| Journalière | ✓ Implémentée (`daily_closures`, scellement via FiscalCore) |
| Mensuelle | Schéma posé (`monthly_closures`), service en Phase 3 |
| Annuelle | Schéma posé (`yearly_closures`), service en Phase 3 |

Les clôtures sont protégées par trigger append-only.

## 7. Vérification d'intégrité

- `FiscalCore.verifyChain(organizationId, range?)` reparse tous les événements,
  recalcule chaque hash et vérifie la continuité (index + previous_hash).
- Accessible via `/fiscal` (UI) et `GET /api/fiscal/verify` (API) pour les
  rôles `super_admin`, `owner`, `comptable`.
- Script CLI : `npm run fiscal:verify`.

## 8. Limites & travaux requis avant certification

Cette base réalise la **mécanique technique** d'inaltérabilité. Pour obtenir
une certification (NF525 ou attestation individuelle), il reste à effectuer :

1. **Documentation éditeur** : dossier de conception complet, procédures de
   développement, gestion des versions, plan de tests, mode d'emploi
   utilisateur final, instructions d'utilisation du logiciel.
2. **Tests d'évaluation** par un organisme habilité (LNE par exemple).
3. **Engagements contractuels** : conditions générales mentionnant la
   conformité, durée de conservation, etc.
4. **Procédure de scellement périodique** côté éditeur (signatures
   horodatées par tiers de confiance, p. ex. RFC 3161).
5. **Procédure d'archivage à valeur probante** (paquets ZIP scellés
   exportés vers un coffre conforme NF Z42-013 ou équivalent).
6. **Mise à jour pour la facturation électronique 2026-2027** (PDP/PPF,
   formats Factur-X / UBL / CII) — interfaces prévues mais non
   implémentées en Phase 1.

## 9. Tests automatisés liés à la conformité

| Test | Localisation |
|---|---|
| Hash reproductible et dépendant du previous_hash | `tests/hash.test.ts` |
| Hash signé HMAC différent du hash simple | `tests/hash.test.ts` |
| Canonicalisation indépendante de l'ordre des clés | `tests/hash.test.ts` |
| Calcul HT/TVA/TTC | `tests/money.test.ts` |
| Permissions critiques (suppression vente validée impossible) | `tests/rbac.test.ts` |

À ajouter en Phase 2/3 : tests d'intégration sur Postgres réel
(détection de gap d'index, modification d'événement détectée, refus
DELETE/UPDATE sur tables append-only, double clôture rejetée).
