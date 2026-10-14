// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Cache serveur de platform_settings (lib/settings/platform-server.ts).
 *
 * platform_settings est une ligne unique (JSONB), lue sur CHAQUE visite du
 * site vitrine (force-dynamic, jamais de cache Next) et sur chaque appel
 * /api/brand (cache: 'no-store' côté client) — sans cache serveur, chaque
 * visite repaie une lecture Postgres de cette ligne, qui peut embarquer
 * plusieurs logos/favicons/visuel de connexion en data URL (jusqu'à
 * quelques Mo). Vu le volume de visites (des centaines de milliers d'appels
 * observés), ce cache réduit l'amplification réseau de façon décisive.
 */
const queryMock = vi.fn();
vi.mock('@/lib/db/client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));

beforeEach(() => { queryMock.mockReset(); vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); });

describe('getPlatformSettingsRaw', () => {
  it('ne réinterroge pas Postgres tant que le cache est frais', async () => {
    const { getPlatformSettingsRaw } = await import('@/lib/settings/platform-server');
    queryMock.mockResolvedValue({ rows: [{ value: { brand_name: 'HelloPos' } }] });

    const a = await getPlatformSettingsRaw();
    const b = await getPlatformSettingsRaw();
    const c = await getPlatformSettingsRaw();

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ brand_name: 'HelloPos' });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('coalesce les appels concurrents pendant un cache froid en une seule lecture', async () => {
    const { getPlatformSettingsRaw } = await import('@/lib/settings/platform-server');
    let resolveQuery!: (v: { rows: { value: unknown }[] }) => void;
    queryMock.mockReturnValue(new Promise((res) => { resolveQuery = res; }));

    const p1 = getPlatformSettingsRaw();
    const p2 = getPlatformSettingsRaw();
    resolveQuery({ rows: [{ value: { brand_name: 'Concurrent' } }] });

    const [a, b] = await Promise.all([p1, p2]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ brand_name: 'Concurrent' });
    expect(b).toEqual(a);
  });

  it('invalidatePlatformSettingsCache force une relecture immédiate', async () => {
    const { getPlatformSettingsRaw, invalidatePlatformSettingsCache } =
      await import('@/lib/settings/platform-server');
    queryMock.mockResolvedValueOnce({ rows: [{ value: { brand_name: 'Avant' } }] });
    expect(await getPlatformSettingsRaw()).toEqual({ brand_name: 'Avant' });

    invalidatePlatformSettingsCache();
    queryMock.mockResolvedValueOnce({ rows: [{ value: { brand_name: 'Après' } }] });
    expect(await getPlatformSettingsRaw()).toEqual({ brand_name: 'Après' });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('relit Postgres une fois le TTL dépassé', async () => {
    vi.useFakeTimers();
    const { getPlatformSettingsRaw } = await import('@/lib/settings/platform-server');
    queryMock.mockResolvedValueOnce({ rows: [{ value: { brand_name: 'Frais' } }] });
    await getPlatformSettingsRaw();

    vi.advanceTimersByTime(61_000);
    queryMock.mockResolvedValueOnce({ rows: [{ value: { brand_name: 'Périmé' } }] });
    const after = await getPlatformSettingsRaw();

    expect(after).toEqual({ brand_name: 'Périmé' });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
