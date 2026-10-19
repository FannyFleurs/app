// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Réglage "Commandes automatiques" (Paramètres → Modes de règlement) : seuls
 * les modes utilisables sans tiroir ni client physiquement présent peuvent
 * être le défaut d'une commande WEB/OGF auto-encaissée — une caisse
 * virtuelle (voir virtual-register.ts) n'a ni l'un ni l'autre.
 *
 * Intégration contre une vraie base Postgres.
 */
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: async () => ({ user: currentUser }),
}));
const { GET, PATCH } = await import('@/app/api/settings/order-auto-checkout/route');

describe('Réglage Commandes automatiques — modes de règlement autorisés', () => {
  let organizationId: string;
  let cardId: string;
  let cashId: string;
  let giftCardId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Settings Auto Checkout ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const user = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Testeur', 'owner') RETURNING id`,
      [organizationId, `sac-${randomUUID()}@example.test`],
    );
    currentUser = { id: user.rows[0]!.id, organizationId, email: 'x', fullName: 'Testeur', role: 'owner' };

    const card = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'card', 'card', 'Carte bancaire', TRUE) RETURNING id`,
      [organizationId],
    );
    cardId = card.rows[0]!.id;
    const cash = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'cash', 'cash', 'Espèces', TRUE) RETURNING id`,
      [organizationId],
    );
    cashId = cash.rows[0]!.id;
    const gc = await query<{ id: string }>(
      `INSERT INTO payment_methods (organization_id, code, kind, label, is_active)
       VALUES ($1, 'gift_card', 'gift_card', 'Carte cadeau', TRUE) RETURNING id`,
      [organizationId],
    );
    giftCardId = gc.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function patchReq(body: Record<string, unknown>) {
    return PATCH(new Request('https://x.test', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  }

  it('refuse "Espèces" comme mode par défaut (pas de tiroir réel sur la caisse virtuelle)', async () => {
    const res = await patchReq({ enabled: true, web_payment_method_id: cashId });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_METHOD_NOT_ALLOWED');
  });

  it('refuse "Carte cadeau" comme mode par défaut (rien à présenter/scanner)', async () => {
    const res = await patchReq({ enabled: true, ogf_payment_method_id: giftCardId });
    expect(res.status).toBe(422);
  });

  it('accepte "Carte bancaire" et le persiste', async () => {
    const res = await patchReq({ enabled: true, web_payment_method_id: cardId });
    expect(res.status).toBe(200);

    const r = await GET(new Request('https://x.test'));
    const { settings } = await r.json();
    expect(settings).toMatchObject({ enabled: true, web_payment_method_id: cardId });
  });

  it('un id de mode de règlement inconnu est rejeté (404)', async () => {
    const res = await patchReq({ web_payment_method_id: randomUUID() });
    expect(res.status).toBe(404);
  });
});
