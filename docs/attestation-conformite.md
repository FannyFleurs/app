# Attestation de conformité — dossier de contrôle

> Document de référence à présenter en cas de **contrôle de l'administration
> fiscale** (DGFiP). Il recense, point par point, les garanties du logiciel de
> caisse HelloPos au regard des exigences françaises applicables aux systèmes
> d'encaissement.

## Ce que la loi exige d'un commerçant

Depuis le 1ᵉʳ janvier 2018 (loi de finances 2016, art. 88 ; **art. 286, I, 3°bis
du CGI**), tout assujetti à la TVA qui enregistre les règlements de ses clients
au moyen d'un logiciel de caisse doit pouvoir **justifier** que ce logiciel
satisfait aux conditions d'**inaltérabilité, sécurisation, conservation et
archivage** des données.

Cette justification prend l'une des deux formes suivantes, **au choix** (elles
ont la **même valeur juridique** — BOI-TVA-DECLA-30-10-30 §40) :

1. un **certificat** délivré par un organisme accrédité (ex. marque **NF525**
   délivrée par Infocert/LNE, ou certification AFNOR) ; **ou**
2. une **attestation individuelle de l'éditeur**, conforme au modèle fixé par
   l'administration.

**HelloPos fournit l'attestation individuelle de l'éditeur** (voie 2). Le présent
document en constitue le support technique détaillé ; l'attestation nominative,
au nom de votre société, est générée et imprimable depuis l'écran
**Conformité fiscale → Attestation de conformité**.

> ⚠️ À ne pas confondre : « attestation individuelle de l'éditeur » n'est **pas**
> la marque NF525. Les deux sont légalement recevables ; HelloPos relève de la
> première. Ce document ne prétend pas à la marque NF525.

---

## Les 4 conditions légales et leur couverture

### 1. Inaltérabilité — les données enregistrées ne peuvent plus être modifiées

| Garantie | Mécanisme dans HelloPos |
|---|---|
| Verrouillage des ventes validées | Trigger PostgreSQL `fn_protect_validated_sale` : toute modification des champs fiscaux d'une vente validée est refusée par la base. Idem sur `invoices`. |
| Journaux append-only | Trigger `fn_block_update_delete` interdisant `UPDATE`/`DELETE` sur 12 tables : `fiscal_events`, `audit_logs`, `daily_closures`, `monthly_closures`, `yearly_closures`, `receipts`, `payments`, `product_price_history`, `stock_movements`, `loyalty_movements`, `gift_card_movements`, `fiscal_archives`. |
| Chaînage cryptographique | Chaque événement fiscal porte `previous_hash` + `current_hash`, avec `current_hash = SHA-256(previous_hash │ index │ type │ payload_canonique)`, scellé en option par une signature **HMAC-SHA256** (clé serveur `FISCAL_SIGNING_KEY`, jamais exposée). Toute retouche casse la chaîne. |
| Numérotation continue sans rupture | Index fiscal monotone (`fiscal_chain_state.next_index`, verrou `FOR UPDATE`) ; numéros de tickets/factures via `document_sequences` (par organisation × type × année). |
| Cumul perpétuel (grand total) | `fiscal_chain_state.grand_total_ttc`, jamais remis à zéro, recopié dans chaque événement. |
| Correction uniquement par pièce nouvelle | Aucune suppression : une erreur se corrige par **avoir** (`credit_notes`) rattaché à la vente d'origine. |

### 2. Sécurisation — accès contrôlé et traçable

| Garantie | Mécanisme |
|---|---|
| Authentification | Sessions HTTP-only, jeton signé HS256 (`SESSION_SECRET`), empreinte serveur révocable. |
| Mots de passe | bcrypt, 12 tours. |
| Anti-force brute | Verrouillage du compte après 8 échecs, 15 minutes. |
| Habilitations | RBAC à 7 rôles + permissions fines. **Aucun rôle** ne possède le droit de supprimer une vente validée (`pos.void_validated_sale` = ∅). |
| Cloisonnement multi-boutiques | Isolation par `organization_id` + Row-Level Security PostgreSQL (contexte tenant transactionnel). |
| En-têtes & cookies | `httpOnly`, `sameSite`, `secure` en production ; X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. |
| Validation des entrées | Schémas `zod` côté serveur sur toutes les routes. |
| Secrets | Clés jamais côté navigateur ; clé fiscale isolée de la clé de session. |

### 3. Conservation — 6 ans, sans perte

| Garantie | Mécanisme |
|---|---|
| Durée légale (6 ans) | Aucune suppression physique possible ; conservation garantie par la base, complétée par les sauvegardes de l'hébergeur. |
| Snapshot figé des tickets | `receipts.snapshot` (JSONB) : état complet de la vente au moment du scellement. |
| Résistance au droit à l'effacement (RGPD) | L'anonymisation client (`is_anonymized`) n'altère **pas** les pièces fiscales, qui conservent leur snapshot. |
| Historique des prix | `product_price_history` append-only (auteur, ancien/nouveau prix, motif). |

### 4. Archivage — clôtures et exports vérifiables

| Garantie | Mécanisme |
|---|---|
| Clôtures scellées | Journalières (`daily_closures`), mensuelles, annuelles — chacune scellée dans la chaîne fiscale et protégée append-only. |
| Grand total & compteurs | Reportés à chaque clôture, contrôlables. |
| Archives à valeur probante | Table `fiscal_archives` : paquets périodiques (JSONL + manifeste SHA-256 + PDF de contrôle). |
| Export pour contrôle | Écran **Conformité fiscale** + vérificateur `npm run fiscal:verify` + `GET /api/fiscal/verify`. |

---

## Traçabilité (transversale)

- **Journal fiscal** `fiscal_events` : append-only, chaîné, horodaté.
- **Journal applicatif** `audit_logs` : séparé, append-only (connexions, échecs,
  actions sensibles).
- **Mouvements** stock / fidélité / cartes cadeaux : tables `*_movements`
  toutes append-only.

## Vérification d'intégrité (démontrable en direct)

L'écran **Conformité fiscale** rejoue toute la chaîne (`verifyChain`),
recalcule chaque empreinte et contrôle la continuité (index + `previous_hash`).
Un contrôleur peut demander cette vérification **séance tenante** :
- bouton **Vérifier la chaîne** sur l'écran Conformité fiscale ;
- ou en ligne de commande : `npm run fiscal:verify`.

## Identification du logiciel

| Élément | Valeur |
|---|---|
| Éditeur | HelloPos |
| Logiciel | HelloPos — caisse SaaS pour fleuristes |
| Voie de conformité | Attestation individuelle de l'éditeur (art. 286-I-3°bis CGI) |
| Références | BOI-TVA-DECLA-30-10-30 ; art. L80 O du LPF ; principes NF525 |

La version exacte et l'empreinte de build figurent sur l'attestation nominative
imprimable (elles identifient sans ambiguïté la version installée).

## Textes de référence

- Article 286, I, 3°bis du Code général des impôts (CGI).
- Article L80 O du Livre des procédures fiscales (LPF) — sanction (7 500 € par
  logiciel non justifié + mise en conformité sous 60 jours).
- BOI-TVA-DECLA-30-10-30 — doctrine administrative (4 conditions, formes de
  justification).

## En cas de contrôle : marche à suivre

1. Ouvrir **Conformité fiscale** dans HelloPos.
2. Cliquer **Attestation de conformité** → imprimer / exporter en PDF.
3. Remettre au contrôleur : l'attestation nominative + (sur demande) le présent
   dossier technique.
4. Sur demande, lancer la **vérification de la chaîne** devant le contrôleur.

> Le dossier technique complet, fonction par fonction, est dans
> [`docs/conformite.md`](./conformite.md).
