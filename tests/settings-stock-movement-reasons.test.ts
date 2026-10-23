// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import {
  mergeStockMovementReasonsDefaults,
  DEFAULT_STOCK_MOVEMENT_REASONS,
} from '@/lib/settings/stock-movement-reasons';

/**
 * Réglage "Motifs de mouvement de stock" (Paramètres → Motifs de mouvement
 * de stock) : liste des motifs proposés pour un mouvement manuel. Chaque
 * motif porte sa PROPRE case "justification obligatoire", qui ne s'applique
 * qu'en SORTIE (une entrée reste toujours facultative, quel que soit le
 * motif — géré côté UI, pas dans ce module).
 */
describe('mergeStockMovementReasonsDefaults', () => {
  it('sans valeur stockée, renvoie les défauts (motifs obligatoires)', () => {
    expect(mergeStockMovementReasonsDefaults(null)).toEqual({ reasons: DEFAULT_STOCK_MOVEMENT_REASONS });
  });

  it('une liste de motifs vide est respectée (pas de repli sur les défauts)', () => {
    expect(mergeStockMovementReasonsDefaults({ reasons: [] })).toEqual({ reasons: [] });
  });

  it('chaque motif garde sa propre case, indépendamment des autres', () => {
    expect(mergeStockMovementReasonsDefaults({
      reasons: [
        { label: 'Casse', justification_required: true },
        { label: 'Retour fournisseur', justification_required: false },
      ],
    })).toEqual({
      reasons: [
        { label: 'Casse', justification_required: true },
        { label: 'Retour fournisseur', justification_required: false },
      ],
    });
  });

  it('migre l\'ancienne forme (reasons: string[] + justification_required global)', () => {
    expect(mergeStockMovementReasonsDefaults({
      reasons: ['Casse', 'Retour fournisseur'],
      justification_required: false,
    } as never)).toEqual({
      reasons: [
        { label: 'Casse', justification_required: false },
        { label: 'Retour fournisseur', justification_required: false },
      ],
    });
  });
});

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET, PATCH } = await import('@/app/api/settings/stock-movement-reasons/route');

describe('GET/PATCH /api/settings/stock-movement-reasons — intégration DB', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settings Stock Reasons ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `smr-${randomUUID()}@example.test`],
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
    expect(settings).toEqual({ reasons: DEFAULT_STOCK_MOVEMENT_REASONS });
  });

  it('ajoute des motifs personnalisés avec leur propre case, et les persiste', async () => {
    const reasons = [
      { label: 'Bris de verre', justification_required: false },
      { label: 'Ravageurs', justification_required: true },
    ];
    const res = await patchReq({ reasons });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual(reasons);

    const after = await GET();
    expect((await after.json()).settings.reasons).toEqual(reasons);
  });

  it('un motif vide ou trop long est rejeté (422)', async () => {
    const res = await patchReq({ reasons: [{ label: '  ', justification_required: true }] });
    expect(res.status).toBe(422);
    const tooLong = await patchReq({ reasons: [{ label: 'x'.repeat(81), justification_required: true }] });
    expect(tooLong.status).toBe(422);
  });

  it('une liste de motifs vide est acceptée (plus aucun motif proposé)', async () => {
    const res = await patchReq({ reasons: [] });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.reasons).toEqual([]);
  });
});
