// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Largeur d'impression réduite (512 points) pour une imprimante CloudPRNT
 * 80 mm — sans changer le papier physique (paper_width reste 80). Même
 * concept que l'imprimante IP (ip-printer.ts, width_dots), étendu au
 * CloudPRNT puisque c'est le chemin réellement utilisé pour le Z.
 *
 * Intégration contre une vraie base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { POST: printersPost } = await import('@/app/api/cloudprnt/printers/route');
const { PATCH: printerPatch } = await import('@/app/api/cloudprnt/printers/[id]/route');

describe('Imprimante CloudPRNT — largeur réduite (512 points, papier 80 mm inchangé)', () => {
  let organizationId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Print Width ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `pw-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function makePrinter(mac: string): Promise<string> {
    const res = await printersPost(new Request('https://x.test', {
      method: 'POST',
      body: JSON.stringify({ mac, label: 'Ticket', role: 'receipt', paper_width: 80 }),
    }));
    expect(res.status).toBe(201);
    return (await res.json() as { id: string }).id;
  }

  it('accepte 512 en PATCH sans toucher au papier (80 mm)', async () => {
    const id = await makePrinter('00:11:22:33:44:55');
    const res = await printerPatch(
      new Request('https://x.test', { method: 'PATCH', body: JSON.stringify({ print_width_dots: 512 }) }),
      { params: { id } },
    );
    expect(res.status).toBe(200);

    const row = await query<{ paper_width: number; print_width_dots: number | null }>(
      `SELECT paper_width, print_width_dots FROM cloudprnt_printers WHERE id = $1`, [id],
    );
    expect(row.rows[0]).toMatchObject({ paper_width: 80, print_width_dots: 512 });
  });

  it('rejette une valeur hors 384/512/576', async () => {
    const id = await makePrinter('00:11:22:33:44:56');
    const res = await printerPatch(
      new Request('https://x.test', { method: 'PATCH', body: JSON.stringify({ print_width_dots: 500 }) }),
      { params: { id } },
    );
    expect(res.status).toBe(422);
  });

  it('repasser à null (standard 576) fonctionne', async () => {
    const id = await makePrinter('00:11:22:33:44:57');
    await printerPatch(
      new Request('https://x.test', { method: 'PATCH', body: JSON.stringify({ print_width_dots: 512 }) }),
      { params: { id } },
    );
    const res = await printerPatch(
      new Request('https://x.test', { method: 'PATCH', body: JSON.stringify({ print_width_dots: null }) }),
      { params: { id } },
    );
    expect(res.status).toBe(200);
    const row = await query<{ print_width_dots: number | null }>(
      `SELECT print_width_dots FROM cloudprnt_printers WHERE id = $1`, [id],
    );
    expect(row.rows[0]!.print_width_dots).toBeNull();
  });

  it('sans réglage explicite, print_width_dots est null (comportement standard inchangé)', async () => {
    const id = await makePrinter('00:11:22:33:44:58');
    const row = await query<{ print_width_dots: number | null }>(
      `SELECT print_width_dots FROM cloudprnt_printers WHERE id = $1`, [id],
    );
    expect(row.rows[0]!.print_width_dots).toBeNull();
  });
});
