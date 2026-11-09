// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitSaleValidation } from '@/lib/pos/sale-checkout';

/**
 * submitSaleValidation : logique PARTAGÉE entre PaymentModal (choix manuel
 * du mode de règlement) et les raccourcis d'encaissement direct de la
 * caisse (bouton « CB », voir CashRegister.tsx::quickPayCard) — POST
 * /api/sales/{id}/validate, traduction des codes d'erreur, et ouverture du
 * tiroir sur l'app native.
 */

let fetchCalls: Array<{ url: string; init?: RequestInit }>;

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return handler(url, init);
  }));
}

beforeEach(() => { fetchCalls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('submitSaleValidation — succès', () => {
  it('poste le tableau de paiements tel quel et renvoie le reçu', async () => {
    stubFetch((url) => {
      if (url === '/api/sales/sale-1/validate') {
        return { ok: true, json: async () => ({ receipt_id: 'r1', receipt_number: 'T-0001', loyalty: null, gift_cards_issued: [] }) };
      }
      throw new Error(`requête non simulée : ${url}`);
    });
    const result = await submitSaleValidation({
      saleId: 'sale-1',
      payments: [{ method: 'card', amount: 20 }],
      storeId: 'store-1',
      methods: [{ kind: 'card', opens_drawer: false }],
    });
    expect(result).toEqual({ ok: true, receipt_id: 'r1', receipt_number: 'T-0001', loyalty: null, gift_cards_issued: [] });
    const body = JSON.parse(String(fetchCalls[0]!.init!.body));
    expect(body.payments).toEqual([{ method: 'card', amount: 20, given_amount: undefined, reference: undefined, label: undefined }]);
  });
});

describe('submitSaleValidation — erreurs', () => {
  it('traduit CASH_SESSION_CLOSED en message convivial', async () => {
    stubFetch(() => ({ ok: false, status: 409, json: async () => ({ error: 'CASH_SESSION_CLOSED' }) }));
    const result = await submitSaleValidation({ saleId: 's', payments: [{ method: 'card', amount: 10 }], methods: [] });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/Journée clôturée/);
  });

  it('traduit NO_OPEN_CASH_SESSION en message convivial', async () => {
    stubFetch(() => ({ ok: false, status: 409, json: async () => ({ error: 'NO_OPEN_CASH_SESSION' }) }));
    const result = await submitSaleValidation({ saleId: 's', payments: [{ method: 'card', amount: 10 }], methods: [] });
    expect((result as { error: string }).error).toMatch(/Journée clôturée/);
  });

  it('renvoie le code brut pour toute autre erreur', async () => {
    stubFetch(() => ({ ok: false, status: 422, json: async () => ({ error: 'PAYMENTS_MISMATCH' }) }));
    const result = await submitSaleValidation({ saleId: 's', payments: [{ method: 'card', amount: 10 }], methods: [] });
    expect((result as { error: string }).error).toBe('PAYMENTS_MISMATCH');
  });
});

describe("submitSaleValidation — ouverture du tiroir (app native)", () => {
  function stubValidateOk() {
    stubFetch((url) => {
      if (url === '/api/sales/sale-1/validate') {
        return { ok: true, json: async () => ({ receipt_id: 'r1', receipt_number: 'T-0001' }) };
      }
      if (url === '/api/cash-sessions/open-drawer') {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error(`requête non simulée : ${url}`);
    });
  }

  it("ouvre le tiroir si le mode utilisé l'exige ET qu'on est sur l'app native (Capacitor présent)", async () => {
    stubValidateOk();
    (window as unknown as { Capacitor?: unknown }).Capacitor = {};
    try {
      await submitSaleValidation({
        saleId: 'sale-1', storeId: 'store-1',
        payments: [{ method: 'cash', amount: 10 }],
        methods: [{ kind: 'cash', opens_drawer: true }],
      });
      expect(fetchCalls.some((c) => c.url === '/api/cash-sessions/open-drawer')).toBe(true);
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });

  it("n'ouvre PAS le tiroir hors app native, même si le mode l'exige", async () => {
    stubValidateOk();
    await submitSaleValidation({
      saleId: 'sale-1', storeId: 'store-1',
      payments: [{ method: 'cash', amount: 10 }],
      methods: [{ kind: 'cash', opens_drawer: true }],
    });
    expect(fetchCalls.some((c) => c.url === '/api/cash-sessions/open-drawer')).toBe(false);
  });

  it("n'ouvre PAS le tiroir si aucun mode utilisé n'a opens_drawer=true (ex. CB sans tiroir configuré)", async () => {
    stubValidateOk();
    (window as unknown as { Capacitor?: unknown }).Capacitor = {};
    try {
      await submitSaleValidation({
        saleId: 'sale-1', storeId: 'store-1',
        payments: [{ method: 'card', amount: 20 }],
        methods: [{ kind: 'card', opens_drawer: false }, { kind: 'cash', opens_drawer: true }],
      });
      expect(fetchCalls.some((c) => c.url === '/api/cash-sessions/open-drawer')).toBe(false);
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });

  it("une panne d'ouverture du tiroir n'invalide pas la vente déjà validée", async () => {
    stubFetch((url) => {
      if (url === '/api/sales/sale-1/validate') {
        return { ok: true, json: async () => ({ receipt_id: 'r1', receipt_number: 'T-0001' }) };
      }
      if (url === '/api/cash-sessions/open-drawer') {
        throw new Error('network down');
      }
      throw new Error(`requête non simulée : ${url}`);
    });
    (window as unknown as { Capacitor?: unknown }).Capacitor = {};
    try {
      const result = await submitSaleValidation({
        saleId: 'sale-1', storeId: 'store-1',
        payments: [{ method: 'cash', amount: 10 }],
        methods: [{ kind: 'cash', opens_drawer: true }],
      });
      expect(result.ok).toBe(true);
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    }
  });
});
