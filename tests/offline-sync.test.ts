import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// État mutable de la file, accessible dès le hoisting (avant les imports).
const h = vi.hoisted(() => ({ store: [] as Array<{ client_ref: string }> }));

vi.mock('@/lib/offline/queue', () => ({
  allQueuedSales: async () => [...h.store],
  removeQueuedSale: async (ref: string) => {
    const i = h.store.findIndex((s) => s.client_ref === ref);
    if (i >= 0) h.store.splice(i, 1);
  },
}));

import { syncOfflineSales } from '@/lib/offline/sync';

function seed(refs: string[]) {
  h.store.length = 0;
  refs.forEach((r) => h.store.push({ client_ref: r }));
}

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('syncOfflineSales', () => {
  it('vide toute la file quand tout réussit et retire les ventes', async () => {
    seed(['a', 'b']);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    const n = await syncOfflineSales();
    expect(n).toBe(2);
    expect(h.store.length).toBe(0);
  });

  it('s\'arrête sur erreur réseau et conserve la vente non synchronisée', async () => {
    seed(['a', 'b']);
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      if (call === 1) return { ok: true, status: 200 };
      throw new Error('network down');
    }));
    const n = await syncOfflineSales();
    expect(n).toBe(1);
    expect(h.store.map((s) => s.client_ref)).toEqual(['b']);
  });

  it('traite une réponse OK (y compris duplicate) comme synchronisée', async () => {
    seed(['a']);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    expect(await syncOfflineSales()).toBe(1);
    expect(h.store.length).toBe(0);
  });

  it('conserve la vente et s\'arrête sur 409 (journée fermée)', async () => {
    seed(['a', 'b']);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409 })));
    const n = await syncOfflineSales();
    expect(n).toBe(0);
    expect(h.store.length).toBe(2);
  });

  it('ne fait rien hors-ligne (aucun appel réseau)', async () => {
    seed(['a']);
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await syncOfflineSales()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.store.length).toBe(1);
  });
});
