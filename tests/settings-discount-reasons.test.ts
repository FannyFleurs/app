// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { mergeDiscountReasonsDefaults, DEFAULT_DISCOUNT_REASONS } from '@/lib/settings/discount-reasons';

/**
 * Réglage "Motifs de remise" (Paramètres → Motifs de remise) : liste des
 * motifs proposés en caisse pour une remise manuelle (ligne ou panier).
 * Chaque motif porte sa PROPRE case "justification obligatoire" — ce n'est
 * plus un réglage unique pour toute la liste.
 */
describe('mergeDiscountReasonsDefaults', () => {
  it('sans valeur stockée, renvoie les défauts (motifs obligatoires)', () => {
    expect(mergeDiscountReasonsDefaults(null)).toEqual({ reasons: DEFAULT_DISCOUNT_REASONS });
  });

  it('une liste de motifs vide est respectée (pas de repli sur les défauts)', () => {
    expect(mergeDiscountReasonsDefaults({ reasons: [] })).toEqual({ reasons: [] });
  });

  it('chaque motif garde sa propre case, indépendamment des autres', () => {
    expect(mergeDiscountReasonsDefaults({
      reasons: [
        { label: 'Geste commercial', justification_required: true },
        { label: 'Promotion en cours', justification_required: false },
      ],
    })).toEqual({
      reasons: [
        { label: 'Geste commercial', justification_required: true },
        { label: 'Promotion en cours', justification_required: false },
      ],
    });
  });

  it('migre l\'ancienne forme (reasons: string[] + justification_required global)', () => {
    expect(mergeDiscountReasonsDefaults({
      reasons: ['Geste commercial', 'Promotion en cours'],
      justification_required: false,
    } as never)).toEqual({
      reasons: [
        { label: 'Geste commercial', justification_required: false },
        { label: 'Promotion en cours', justification_required: false },
      ],
    });
  });

  it('un motif vide (ancienne ou nouvelle forme) est filtré', () => {
    expect(mergeDiscountReasonsDefaults({
      reasons: ['', { label: '  ', justification_required: true }, { label: 'OK', justification_required: true }],
    } as never)).toEqual({ reasons: [{ label: 'OK', justification_required: true }] });
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
    expect(settings).toEqual({ reasons: DEFAULT_DISCOUNT_REASONS });
  });

  it('ajoute des motifs personnalisés avec leur propre case, et les persiste', async () => {
    const reasons = [
      { label: 'Carte fidélité à activer', justification_required: false },
      { label: 'Lot dégradé', justification_required: true },
    ];
    const res = await patchReq({ reasons });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual(reasons);

    const after = await GET();
    expect((await after.json()).settings.reasons).toEqual(reasons);
  });

  it('bascule la case d\'un seul motif sans affecter les autres', async () => {
    const res = await patchReq({
      reasons: [
        { label: 'Carte fidélité à activer', justification_required: true },
        { label: 'Lot dégradé', justification_required: true },
      ],
    });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual([
      { label: 'Carte fidélité à activer', justification_required: true },
      { label: 'Lot dégradé', justification_required: true },
    ]);
  });

  it('un motif vide ou trop long est rejeté (422)', async () => {
    const res = await patchReq({ reasons: [{ label: '  ', justification_required: true }] });
    expect(res.status).toBe(422);
    const tooLong = await patchReq({ reasons: [{ label: 'x'.repeat(81), justification_required: true }] });
    expect(tooLong.status).toBe(422);
  });

  it('un motif sans justification_required est rejeté (422)', async () => {
    const res = await patchReq({ reasons: [{ label: 'Sans case' }] });
    expect(res.status).toBe(422);
  });

  it('une liste de motifs vide est acceptée (plus aucun motif proposé)', async () => {
    const res = await patchReq({ reasons: [] });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual([]);
  });
});
