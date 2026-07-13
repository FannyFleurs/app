import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const schema = z.object({
  name: z.string().min(1).max(160),
  contact_name: z.string().max(160).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  try {
    const { rows } = await query(
      `SELECT id, name, contact_name, email, phone, address, notes, is_active,
              (SELECT COUNT(*)::int FROM products p WHERE p.supplier_id = s.id) AS product_count
         FROM suppliers s
        WHERE s.organization_id = $1 AND s.is_active = TRUE
        ORDER BY s.name ASC`,
      [g.user.organizationId],
    );
    return NextResponse.json({ suppliers: rows });
  } catch {
    // Migration 0038 non appliquée : on renvoie une liste vide plutôt que
    // de casser la fiche article.
    return NextResponse.json({ suppliers: [] });
  }
}

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const s = parsed.data;
  try {
    const ins = await query<{ id: string }>(
      `INSERT INTO suppliers
         (organization_id, name, contact_name, email, phone, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        g.user.organizationId, s.name.trim(),
        s.contact_name ?? null, s.email ?? null, s.phone ?? null,
        s.address ?? null, s.notes ?? null,
      ],
    );
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    const hint = m.includes('suppliers')
      ? 'Migration manquante : exécutez `npm run db:migrate` pour appliquer 0038_suppliers.sql.'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
