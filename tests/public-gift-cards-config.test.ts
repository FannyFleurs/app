import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * API publique GET /api/public/gift-cards/config — voir docs/api-public-gift-cards.md.
 *
 * Base de données simulée en mémoire (deux organisations, comme en
 * production deux organisations partagent la même table `settings`) : permet
 * de vérifier le comportement réel de la route (statuts, corps de réponse,
 * en-têtes CORS), pas seulement la présence de motifs dans le code source.
 */

interface FakeOrg { id: string; name: string; is_active: boolean }
interface FakeConfig {
  organization_id: string;
  public_key: string;
  enabled: boolean;
  allowed_origins: string[];
  preset_amounts: number[];
  allow_custom_amount: boolean;
  min_amount: number;
  max_amount: number;
}

const orgs: FakeOrg[] = [
  { id: 'org-a-uuid', name: 'Plante Verte', is_active: true },
  { id: 'org-b-uuid', name: 'Fanny Fleurs', is_active: true },
];

const configs: FakeConfig[] = [
  {
    organization_id: 'org-a-uuid',
    public_key: 'hp_gc_AAAAAAAAAAAAAAAAAAAA',
    enabled: true,
    allowed_origins: ['https://plante-verte.fr'],
    preset_amounts: [25, 50],
    allow_custom_amount: true,
    min_amount: 10,
    max_amount: 500,
  },
  {
    // Intégration désactivée : doit se comporter EXACTEMENT comme une clé inconnue.
    organization_id: 'org-b-uuid',
    public_key: 'hp_gc_BBBBBBBBBBBBBBBBBBBB',
    enabled: false,
    allowed_origins: ['https://fanny-fleurs.com'],
    preset_amounts: [30],
    allow_custom_amount: false,
    min_amount: 20,
    max_amount: 200,
  },
];

const queryMock = vi.fn(async (text: string, params: unknown[] = []) => {
  if (text.includes("value->>'public_key'")) {
    const key = params[1] as string;
    const row = configs.find((c) => c.public_key === key);
    if (!row) return { rows: [], rowCount: 0 };
    const { organization_id, ...value } = row;
    return { rows: [{ organization_id, value }], rowCount: 1 };
  }
  if (text.includes('FROM organizations')) {
    const id = params[0] as string;
    const org = orgs.find((o) => o.id === id && o.is_active);
    return { rows: org ? [{ name: org.name }] : [], rowCount: org ? 1 : 0 };
  }
  throw new Error(`Requête non simulée dans le test : ${text}`);
});

vi.mock('@/lib/db/client', () => ({ query: queryMock }));

// Import APRÈS le mock (vitest hoisse vi.mock, mais on reste explicite).
const { GET, OPTIONS } = await import('@/app/api/public/gift-cards/config/route');

function req(url: string, origin?: string): Request {
  return new Request(url, { headers: origin ? { origin } : {} });
}

const BASE_URL = 'https://app.hellopos.fr/api/public/gift-cards/config';

beforeEach(() => { queryMock.mockClear(); });

describe('API publique — clé valide et active', () => {
  it('renvoie 200 avec la configuration de la bonne organisation', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      enabled: true,
      organization: { name: 'Plante Verte' },
      gift_cards: {
        preset_amounts: [25, 50],
        allow_custom_amount: true,
        min_amount: 10,
        max_amount: 500,
      },
    });
  });

  it("ne fuit jamais l'organization_id, un store_id, ni rien de Stripe", async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`));
    const raw = await res.text();
    expect(raw).not.toContain('org-a-uuid');
    expect(raw.toLowerCase()).not.toContain('stripe');
    expect(raw).not.toContain('store_id');
    expect(raw).not.toContain('organization_id');
  });

  it('ne renvoie jamais la configuration de l\'autre organisation (pas de collision)', async () => {
    const resA = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`));
    const bodyA = await resA.json();
    expect(bodyA.organization.name).toBe('Plante Verte');
    expect(bodyA.gift_cards.preset_amounts).toEqual([25, 50]);
    expect(bodyA.organization.name).not.toBe('Fanny Fleurs');
  });

  it('fonctionne sans en-tête Origin (curl / SSR / serveur à serveur)', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('API publique — clé désactivée / inconnue / malformée : réponse neutre identique', () => {
  it('clé désactivée => 404 GIFT_CARDS_NOT_AVAILABLE', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_BBBBBBBBBBBBBBBBBBBB`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'GIFT_CARDS_NOT_AVAILABLE' });
  });

  it('clé inconnue => même statut, même corps', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_ZZZZZZZZZZZZZZZZZZZZ`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'GIFT_CARDS_NOT_AVAILABLE' });
  });

  it('clé malformée => même statut, même corps, ET aucune requête base de données', async () => {
    const res = await GET(req(`${BASE_URL}?key=n-importe-quoi`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'GIFT_CARDS_NOT_AVAILABLE' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('clé absente => même statut, même corps', async () => {
    const res = await GET(req(BASE_URL));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'GIFT_CARDS_NOT_AVAILABLE' });
  });

  it("n'ajoute aucun en-tête CORS sur la réponse neutre, même avec un Origin fourni", async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_BBBBBBBBBBBBBBBBBBBB`, 'https://fanny-fleurs.com'));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('CORS', () => {
  it('origine autorisée => Access-Control-Allow-Origin exact (jamais *)', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`, 'https://plante-verte.fr'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://plante-verte.fr');
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('origine NON autorisée => aucun Access-Control-Allow-Origin (mais les données restent servies)', async () => {
    const res = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`, 'https://un-site-quelconque.test'));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect((await res.json()).organization.name).toBe('Plante Verte');
  });

  it('OPTIONS avec origine autorisée renvoie les en-têtes CORS attendus', async () => {
    const res = await OPTIONS(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`, 'https://plante-verte.fr'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://plante-verte.fr');
    expect(res.headers.get('access-control-allow-methods')).toMatch(/GET/);
  });

  it('OPTIONS avec clé invalide ne renvoie aucun en-tête CORS', async () => {
    const res = await OPTIONS(req(`${BASE_URL}?key=invalide`, 'https://plante-verte.fr'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('Multi-tenant', () => {
  it("la clé de l'organisation A ne retourne jamais les paramètres commerciaux de B", async () => {
    const resA = await GET(req(`${BASE_URL}?key=hp_gc_AAAAAAAAAAAAAAAAAAAA`));
    const bodyA = await resA.json();
    expect(bodyA.gift_cards.min_amount).toBe(10);
    expect(bodyA.gift_cards.max_amount).toBe(500);
    expect(bodyA.gift_cards.min_amount).not.toBe(20); // valeurs de B
  });
});
