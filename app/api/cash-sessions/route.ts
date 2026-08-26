import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { userCan } from '@/lib/auth/permissions';
import { parseJson, jsonError } from '@/lib/validation/api';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { query } from '@/lib/db/client';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';

/** Mode « fonds commun » configuré pour cette boutique. */
async function isSharedFloat(organizationId: string, storeId: string | null): Promise<boolean> {
  if (!storeId) return false;
  const value = await loadScopedSettingValue<CashSettings>(organizationId, CASH_KEY, storeId);
  return mergeCashDefaults(value).shared_float;
}

const openSchema = z.object({
  store_id: z.string().uuid(),
  register_id: z.string().uuid(),
  opening_float: z.number().min(0),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const registerId = url.searchParams.get('register_id');
  if (!registerId) return jsonError('register_id requis', 400);

  // La boutique peut être déduite du poste : le client n'a pas à la fournir.
  const storeRow = await query<{ store_id: string }>(
    `SELECT store_id FROM registers WHERE id = $1 AND organization_id = $2`,
    [registerId, g.user.organizationId],
  );
  const storeId = storeRow.rows[0]?.store_id ?? null;
  const shared = await isSharedFloat(g.user.organizationId, storeId);

  // Fonds commun : c'est la session de la BOUTIQUE qui fait foi, ouverte par
  // n'importe lequel des postes. Fonds individuel : celle du poste seul.
  const session = shared && storeId
    ? await CashSessionService.getOpenForStore(storeId)
    : await CashSessionService.getOpenForRegister(registerId);

  const openedElsewhere = Boolean(
    shared && session && 'register_id' in session && session.register_id !== registerId,
  );

  return NextResponse.json({ session, shared, opened_elsewhere: openedElsewhere });
}

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, openSchema);
  if ('response' in parsed) return parsed.response;
  // vérifie appartenance store/register à l'org
  const r = await query(
    `SELECT 1 FROM registers
      WHERE id = $1 AND store_id = $2 AND organization_id = $3 AND is_active`,
    [parsed.data.register_id, parsed.data.store_id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);

  // Journée déjà FERMÉE (Z scellé aujourd'hui pour cette boutique) : la
  // réouverture est réservée aux responsables (closures.daily). Un vendeur ne
  // peut pas rouvrir la caisse le jour même.
  const sealed = await query(
    `SELECT 1 FROM daily_closures
      WHERE organization_id = $1 AND store_id = $2
        AND business_date = (now() AT TIME ZONE 'Europe/Paris')::date
        AND sealed_at IS NOT NULL
      LIMIT 1`,
    [g.user.organizationId, parsed.data.store_id],
  );
  if ((sealed.rowCount ?? 0) > 0 && !(await userCan(g.user, 'closures.daily'))) {
    return jsonError('DAY_SEALED', 403);
  }

  const shared = await isSharedFloat(g.user.organizationId, parsed.data.store_id);
  try {
    const out = await CashSessionService.open({
      organizationId: g.user.organizationId,
      storeId: parsed.data.store_id,
      registerId: parsed.data.register_id,
      userId: g.user.id,
      openingFloat: parsed.data.opening_float,
      shared,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 409);
  }
}
