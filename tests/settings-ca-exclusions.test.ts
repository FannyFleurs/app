// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET, PATCH } = await import('@/app/api/settings/ca-exclusions/route');

describe('GET/PATCH /api/settings/ca-exclusions — intégration DB', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settings CA Exclusions ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `sce-${randomUUID()}@example.test`],
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

  it('sans réglage enregistré, GET renvoie une liste vide', async () => {
    const res = await GET();
    const { settings } = await res.json();
    expect(settings).toEqual({ entries: [] });
  });

  it('ajoute une exclusion de chaque type et les persiste', async () => {
    const entries = [
      { type: 'customer', id: randomUUID(), label: 'OGF Services Financiers' },
      { type: 'payment_method', label: 'Web' },
      { type: 'payment_method', label: 'Chorus' },
      { type: 'category', id: randomUUID(), label: 'Mariage' },
    ];
    const res = await patchReq({ entries });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.entries).toEqual(entries);

    const after = await GET();
    expect((await after.json()).settings.entries).toEqual(entries);
  });

  it('retire une entrée sans toucher aux autres', async () => {
    const res = await patchReq({ entries: [{ type: 'payment_method', label: 'Web' }] });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.entries).toEqual([{ type: 'payment_method', label: 'Web' }]);
  });

  it('un type customer/category sans id valide est rejeté (422)', async () => {
    const res = await patchReq({ entries: [{ type: 'customer', id: 'not-a-uuid', label: 'X' }] });
    expect(res.status).toBe(422);
  });

  it('un mode de règlement avec un libellé vide est rejeté (422)', async () => {
    const res = await patchReq({ entries: [{ type: 'payment_method', label: '' }] });
    expect(res.status).toBe(422);
  });

  it('une liste vide est acceptée (plus aucune exclusion)', async () => {
    const res = await patchReq({ entries: [] });
    expect(res.status).toBe(200);
    const { settings } = await res.json();
    expect(settings.entries).toEqual([]);
  });
});
