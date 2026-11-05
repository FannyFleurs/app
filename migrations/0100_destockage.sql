-- Déstockage : une série de sorties de stock (casse, péremption, perte…)
-- scannées à la chaîne sur le PDA et validées en une seule fois sous un code
-- unique (ex. D-2026-000013), à noter sur le contenant jeté pour la
-- retrouver plus tard. Les mouvements eux-mêmes restent dans
-- stock_movements (movement_type='loss', source_type='destockage',
-- source_id = destockage_batches.id) — cette table ne porte que l'identité
-- et le résumé de la série, comme receptions le fait pour les réceptions.
CREATE TABLE destockage_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    reference TEXT NOT NULL,
    reason TEXT NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    total_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, reference)
);

CREATE INDEX idx_destockage_batches_org_created ON destockage_batches (organization_id, created_at DESC);
