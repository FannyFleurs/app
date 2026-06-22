-- Modes de règlement gérables par l'organisation.
-- Chaque méthode est rattachée à un "kind" canonique côté code
-- (cash, card, check, transfer, gift_card, credit_note, deferred, other)
-- pour garder la sémantique fiscale tout en permettant à l'organisation
-- de personnaliser libellé / activer-désactiver / en ajouter.

CREATE TABLE IF NOT EXISTS payment_methods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,                -- code applicatif unique par org
    kind            TEXT NOT NULL CHECK (kind IN
        ('cash','card','check','transfer','gift_card','credit_note','deferred','other')),
    label           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    position        INT NOT NULL DEFAULT 0,
    icon            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE TRIGGER trg_payment_methods_touch BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Seed par défaut pour chaque organisation existante
INSERT INTO payment_methods (organization_id, code, kind, label, position)
SELECT o.id, kv.code, kv.kind, kv.label, kv.position
  FROM organizations o
  CROSS JOIN (VALUES
      ('cash',         'cash',         'Espèces',          0),
      ('card',         'card',         'Carte bancaire',   1),
      ('check',        'check',        'Chèque',           2),
      ('gift_card',    'gift_card',    'Carte cadeau',     3),
      ('credit_note',  'credit_note',  'Avoir',            4),
      ('transfer',     'transfer',     'Virement',         5)
   ) AS kv(code, kind, label, position)
ON CONFLICT DO NOTHING;
