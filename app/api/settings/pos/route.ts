import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  POS_TILE_SIZES,
  POS_THEME_COLORS,
  OPENING_FLOAT_MODES,
  COLOR_SCHEMES,
  POS_UI_KEY,
  mergeWithDefaults,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';

const walletSchema = z.object({
  enabled: z.boolean().optional(),
  pass_type_id: z.string().max(160).optional(),
  team_id: z.string().max(40).optional(),
  logo_text: z.string().max(60).optional(),
  primary_label: z.string().max(40).optional(),
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  foreground_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  show_points: z.boolean().optional(),
  show_tier: z.boolean().optional(),
  show_since: z.boolean().optional(),
  back_message: z.string().max(500).optional(),
}).partial();

const loyaltySchema = z.object({
  enabled: z.boolean().optional(),
  euros_earned: z.number().min(0).optional(),
  per_euros_spent: z.number().positive().optional(),
  min_redeem: z.number().min(0).optional(),
  stackable: z.boolean().optional(),
  on_excluded_categories: z.array(z.string()).optional(),
  // Périmètre multi-boutiques (Croissance+).
  scope: z.enum(['shared', 'per_store', 'grouped']).optional(),
  store_groups: z.record(z.string(), z.string().max(60)).optional(),
  wallet: walletSchema.optional(),
}).partial();

const schema = z.object({
  tile_size: z.enum(POS_TILE_SIZES).optional(),
  theme_color: z.enum(POS_THEME_COLORS).optional(),
  color_scheme: z.enum(COLOR_SCHEMES).optional(),
  show_product_image: z.boolean().optional(),
  show_category_badge: z.boolean().optional(),
  show_price: z.boolean().optional(),
  show_tax_badge: z.boolean().optional(),
  opening_float_mode: z.enum(OPENING_FLOAT_MODES).optional(),
  opening_float_amount: z.number().min(0).max(100000).optional(),
  loyalty: loyaltySchema.optional(),
  hidden_sidebar_paths: z.array(z.string().max(120)).optional(),
  auto_logout_mode: z.enum(['never', 'after_sale', 'timer']).optional(),
  auto_logout_minutes: z.number().int().min(1).max(120).optional(),
  header_tabs: z.array(z.string().max(120)).max(10).optional(),
});

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  return NextResponse.json({ settings: mergeWithDefaults(rows[0]?.value ?? null) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('pos.settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  // Pour les sous-objets (loyalty et loyalty.wallet), on merge recursivement
  // avec l'existant + defauts pour ne pas ecraser un champ non envoye.
  const existing = current.rows[0]?.value ?? {};
  const nextLoyalty = parsed.data.loyalty
    ? {
        ...(existing.loyalty ?? {}),
        ...parsed.data.loyalty,
        wallet: parsed.data.loyalty.wallet
          ? { ...(existing.loyalty?.wallet ?? {}), ...parsed.data.loyalty.wallet }
          : existing.loyalty?.wallet,
      }
    : existing.loyalty;
  const merged = mergeWithDefaults({
    ...existing,
    ...parsed.data,
    loyalty: nextLoyalty,
  } as Partial<PosUiSettings>);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, POS_UI_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.pos_ui.update',
    entityType: 'settings',
    payload: parsed.data,
  });

  return NextResponse.json({ settings: merged });
}
