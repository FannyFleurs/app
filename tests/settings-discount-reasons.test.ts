// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { mergeDiscountReasonsDefaults, DEFAULT_DISCOUNT_REASONS } from '@/lib/settings/discount-reasons';

/**
 * Réglage "Motifs de remise" (Paramètres → Motifs de remise) : liste des
 * motifs proposés en caisse pour une remise manuelle (ligne ou panier), et
 * obligation ou non de les justifier. Réglage au niveau organisation,
 * sans portée boutique.
 */
describe('mergeDiscountReasonsDefaults', () => {
  it('sans valeur stockée, renvoie les défauts (motifs obligatoires)', () => {
    expect(mergeDiscountReasonsDefaults(null)).toEqual({
      reasons: DEFAULT_DISCOUNT_REASONS,
      justification_required: true,
    });
  });

  it('un partiel ne redéfinissant que justification_required garde les motifs par défaut', () => {
    expect(mergeDiscountReasonsDefaults({ justification_required: false })).toEqual({
      reasons: DEFAULT_DISCOUNT_REASONS,
      justification_required: false,
    });
  });

  it('une liste de motifs vide est respectée (pas de repli sur les défauts)', () => {
    expect(mergeDiscountReasonsDefaults({ reasons: [] })).toEqual({
      reasons: [],
      justification_required: true,
    });
  });
});

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET, PATCH } = await import('@/app/api/settings/discount-reasons/route');

describe('GET/PATCH /api/settings/discount-reasons — intégration DB', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settings Discount Reasons ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `sdr-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  function patchReq(body: Record<string, unknown>) {
    return PATCH(new Request('https://x.test', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  it('sans réglage enregistré, GET renvoie les motifs par défaut, obligatoires', async () => {
    const res = await GET();
    const { settings } = await res.json();
    expect(settings).toEqual({ reasons: DEFAULT_DISCOUNT_REASONS, justification_required: true });
  });

  it('ajoute des motifs personnalisés et les persiste', async () => {
    const reasons = ['Carte fidélité à activer', 'Lot dégradé'];
    const res = await patchReq({ reasons });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual(reasons);

    const after = await GET();
    expect((await after.json()).settings.reasons).toEqual(reasons);
  });

  it('décocher "justification obligatoire" se persiste sans effacer les motifs', async () => {
    const res = await patchReq({ justification_required: false });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.justification_required).toBe(false);
    expect(settings.reasons).toEqual(['Carte fidélité à activer', 'Lot dégradé']);
  });

  it('un motif vide ou trop long est rejeté (422)', async () => {
    const res = await patchReq({ reasons: ['  '] });
    expect(res.status).toBe(422);
    const tooLong = await patchReq({ reasons: ['x'.repeat(81)] });
    expect(tooLong.status).toBe(422);
  });

  it('une liste de motifs vide est acceptée (plus aucun motif proposé)', async () => {
    const res = await patchReq({ reasons: [] });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual([]);
  });
});
