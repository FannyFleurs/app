import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const KINDS = ['cash','card','check','transfer','gift_card','credit_note','payment_link','deferred','other'] as const;

const schema = z.object({
  code: z.string().max(40).optional(),
  kind: z.enum(KINDS),
  label: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
});

const DEFAULT_METHODS: Array<{ kind: typeof KINDS[number]; label: string; position: number }> = [
  { kind: 'cash',         label: 'Espèces',              position: 10 },
  { kind: 'card',         label: 'Carte bancaire',       position: 20 },
  { kind: 'check',        label: 'Chèque',               position: 30 },
  { kind: 'transfer',     label: 'Virement',             position: 40 },
  { kind: 'gift_card',    label: 'Carte cadeau',         position: 50 },
  { kind: 'credit_note',  label: 'Avoir',                position: 60 },
  { kind: 'payment_link', label: 'Lien de paiement Stripe', position: 70 },
];

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  // Auto-seed : si l'organisation n'a aucun mode de reglement, on cree
  // les modes par defaut. C'est cette absence de seed qui faisait
  // apparaitre la page /settings/payment-methods "vide" alors que la
  // modale d'encaissement affichait les modes du fallback en dur.
  let { rows } = await query<{ id: string; code: string; kind: string; label: string; is_active: boolean; position: number }>(
    `SELECT id, code, kind, label, is_active, position
       FROM payment_methods WHERE organization_id = $1
      ORDER BY position, label`,
    [g.user.organizationId],
  );
  if (rows.length === 0) {
    for (const m of DEFAULT_METHODS) {
      const code = `${m.kind}_default`;
      try {
        await query(
          `INSERT INTO payment_methods (organization_id, code, kind, label, position)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [g.user.organizationId, code, m.kind, m.label, m.position],
        );
      } catch { /* on n'echoue jamais la lecture pour un probleme de seed */ }
    }
    const reload = await query<{ id: string; code: string; kind: string; label: string; is_active: boolean; position: number }>(
      `SELECT id, code, kind, label, is_active, position
         FROM payment_methods WHERE organization_id = $1
        ORDER BY position, label`,
      [g.user.organizationId],
    );
    rows = reload.rows;
  }
  return NextResponse.json({ methods: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const m = parsed.data;
  const code = m.code ?? `${m.kind}_${Date.now().toString(36)}`;
  const ins = await query<{ id: string }>(
    `INSERT INTO payment_methods (organization_id, code, kind, label, position)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [g.user.organizationId, code, m.kind, m.label, m.position ?? 99],
  );
  return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
}
