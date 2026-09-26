-- Encaissements externes à rattacher à une SESSION DE CAISSE d'une boutique
-- — brique GÉNÉRIQUE (pas spécifique aux cartes cadeaux), pour tout
-- encaissement qui arrive HORS du flux caisse habituel (ici : le paiement
-- Stripe d'une carte cadeau achetée en ligne, confirmé par webhook, à un
-- instant qui ne correspond pas forcément à une session de caisse ouverte).
--
-- Règle métier (voir docs/architecture-multi-store-stripe.md) :
--   - une cash_session de la boutique est ouverte au moment de
--     l'encaissement -> rattachement IMMÉDIAT (cash_session_id renseigné
--     dès la création de la ligne) ;
--   - aucune n'est ouverte -> la ligne reste EN ATTENTE
--     (cash_session_id NULL) jusqu'à l'ouverture suivante d'une session de
--     caisse de CETTE boutique, qui l'affecte alors automatiquement (voir
--     CashSessionService.open).
--
-- `occurred_at` conserve la date/heure RÉELLE de l'encaissement (ex. le
-- paiement Stripe effectif) — JAMAIS modifiée par l'affectation différée,
-- contrairement à `assigned_at` qui, elle, note quand le rattachement à une
-- session a eu lieu. Une clôture déjà scellée n'est jamais rouverte ni
-- modifiée par ce mécanisme : l'affectation ne vise toujours qu'une session
-- `cash_sessions.status = 'open'`.
--
-- `source_type`/`source_id` : référence polymorphe (pas de contrainte FK
-- stricte, volontairement — permet de futurs types de source sans
-- modification de schéma) vers l'enregistrement d'origine (aujourd'hui :
-- `online_gift_card_orders`). `UNIQUE (source_type, source_id)` garantit
-- l'idempotence : un webhook Stripe rejoué ne crée jamais une seconde ligne
-- pour la même commande.
CREATE TABLE pending_store_operations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id              UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,

    -- Nature de l'opération — extensible (règlement Stripe externe, etc.),
    -- une seule valeur pour l'instant : ne pas sur-concevoir avant besoin réel.
    kind                  TEXT NOT NULL CHECK (kind IN ('online_gift_card')),

    amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
    currency              TEXT NOT NULL DEFAULT 'eur',

    -- Libellé d'affichage dans les rapports caisse (Z, day-report) — ex.
    -- "Carte cadeau en ligne / Stripe". Stocké plutôt que recalculé : reste
    -- stable même si la présentation par défaut d'un `kind` change plus tard.
    payment_label         TEXT NOT NULL,

    -- Date/heure RÉELLE de l'encaissement (ex. Stripe checkout.session
    -- payment confirmé) — jamais réécrite par l'affectation à une session.
    occurred_at           TIMESTAMPTZ NOT NULL,

    -- NULL = en attente d'affectation. Renseigné immédiatement si une
    -- session était déjà ouverte, ou plus tard par CashSessionService.open.
    cash_session_id       UUID REFERENCES cash_sessions(id),
    assigned_at           TIMESTAMPTZ,

    -- Référence polymorphe vers la source (aujourd'hui : online_gift_card_orders).
    source_type           TEXT NOT NULL CHECK (source_type IN ('online_gift_card_order')),
    source_id             UUID NOT NULL,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source_type, source_id)
);

CREATE INDEX idx_pending_store_operations_store ON pending_store_operations (store_id);
-- Recherche rapide des opérations à affecter à l'ouverture d'une session
-- (une boutique n'a normalement que quelques lignes en attente au plus).
CREATE INDEX idx_pending_store_operations_unassigned
  ON pending_store_operations (store_id)
  WHERE cash_session_id IS NULL;
-- Rapports caisse (Z/day-report) : toutes les opérations d'une session donnée.
CREATE INDEX idx_pending_store_operations_session
  ON pending_store_operations (cash_session_id)
  WHERE cash_session_id IS NOT NULL;

-- Append-only comme les autres tables financières scellées (paiements,
-- mouvements de carte cadeau…) : une fois créée, une ligne n'est modifiée
-- QUE pour poser cash_session_id/assigned_at (l'affectation), jamais son
-- montant/sa date réelle. On protège donc uniquement contre la suppression
-- ici — la mise à jour d'affectation reste un besoin légitime, contrairement
-- aux tables déjà verrouillées en écriture totale.
CREATE OR REPLACE FUNCTION fn_block_delete_pending_store_operations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TABLE_APPEND_ONLY: pending_store_operations ne peut jamais être supprimée (%).', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pending_store_operations_no_delete
  BEFORE DELETE ON pending_store_operations
  FOR EACH ROW EXECUTE FUNCTION fn_block_delete_pending_store_operations();
