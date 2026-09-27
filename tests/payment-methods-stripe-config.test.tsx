// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PaymentMethodsForm from '@/app/(app)/settings/payment-methods/PaymentMethodsForm';

/**
 * Section « Configuration Stripe » de /settings/payment-methods (« Modes de
 * règlement ») — c'est l'ÉCRAN RÉELLEMENT UTILISÉ pour configurer Stripe
 * (aucune entrée de menu ne pointe vers une autre route). Une précédente
 * évolution avait ajouté un sélecteur de boutique sur une route
 * /settings/stripe orpheline (jamais reliée au menu), pendant que CET écran
 * continuait d'appeler /api/settings/stripe sans store_id — le sélecteur
 * n'était donc jamais visible pour l'utilisateur. Ce test vérifie
 * directement le composant réellement rendu.
 */

const STORES = [
  { id: 'store-ff', name: 'Fanny Fleurs' },
  { id: 'store-pv', name: 'Plante Verte' },
];

const PAYMENT_METHODS = [
  { id: 'pm-1', code: 'cash', kind: 'cash', label: 'Espèces', is_active: true, position: 0, store_ids: [] },
  { id: 'pm-2', code: 'payment_link', kind: 'payment_link', label: 'Lien de paiement Stripe', is_active: true, position: 1, store_ids: [] },
];

interface StripeConfigByStore {
  [storeId: string]: {
    enabled: boolean; publishable_key: string;
    secret_key_masked: string; secret_key_set: boolean;
    webhook_secret_masked: string; webhook_secret_set: boolean;
    return_url: string;
  };
}

let stripeConfigs: StripeConfigByStore;
let inheritedStores: Set<string>;
let patchCalls: Array<{ body: Record<string, unknown> }>;

function resetFakeApi() {
  stripeConfigs = {
    'store-ff': {
      enabled: true, publishable_key: 'pk_test_ff', secret_key_masked: 'sk_test•••…_ff', secret_key_set: true,
      webhook_secret_masked: 'whsec_•••…_ff', webhook_secret_set: true, return_url: '',
    },
    'store-pv': {
      enabled: false, publishable_key: '', secret_key_masked: '', secret_key_set: false,
      webhook_secret_masked: '', webhook_secret_set: false, return_url: '',
    },
  };
  inheritedStores = new Set();
  patchCalls = [];
}

beforeEach(() => {
  resetFakeApi();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/payment-methods') && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ methods: PAYMENT_METHODS }) } as unknown as Response;
    }
    if (url.startsWith('/api/settings/stripe') && (!init || init.method === undefined)) {
      const u = new URL(url, 'https://x.test');
      const storeId = u.searchParams.get('store_id') ?? '';
      const cfg = stripeConfigs[storeId] ?? {
        enabled: false, publishable_key: '', secret_key_masked: '', secret_key_set: false,
        webhook_secret_masked: '', webhook_secret_set: false, return_url: '',
      };
      return { ok: true, json: async () => ({ inherited: inheritedStores.has(storeId), settings: cfg }) } as unknown as Response;
    }
    if (url === '/api/settings/stripe' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patchCalls.push({ body });
      const storeId = (body.store_id as string) ?? '';
      const prev = stripeConfigs[storeId] ?? {
        enabled: false, publishable_key: '', secret_key_masked: '', secret_key_set: false,
        webhook_secret_masked: '', webhook_secret_set: false, return_url: '',
      };
      stripeConfigs[storeId] = {
        enabled: (body.enabled as boolean) ?? prev.enabled,
        publishable_key: (body.publishable_key as string) ?? prev.publishable_key,
        secret_key_set: body.secret_key ? true : prev.secret_key_set,
        secret_key_masked: body.secret_key ? 'sk_test•••…NEW' : prev.secret_key_masked,
        webhook_secret_set: body.webhook_secret ? true : prev.webhook_secret_set,
        webhook_secret_masked: body.webhook_secret ? 'whsec_•••…NEW' : prev.webhook_secret_masked,
        return_url: (body.return_url as string) ?? prev.return_url,
      };
      inheritedStores.delete(storeId);
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    throw new Error(`Requête non simulée dans le test : ${url}`);
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderForm() {
  render(<PaymentMethodsForm canWrite stores={STORES} />);
  await waitFor(() => screen.getByText('Configuration Stripe'));
}

function storeSelect(): HTMLSelectElement {
  const label = screen.getByText('Boutique');
  return label.parentElement!.querySelector('select')!;
}

describe('Configuration Stripe dans Modes de règlement (/settings/payment-methods)', () => {
  it('le sélecteur de boutique est visible pour une organisation à plusieurs boutiques', async () => {
    await renderForm();
    const select = storeSelect();
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toEqual(['Fanny Fleurs', 'Plante Verte']);
  });

  it('charge par défaut la config de la première boutique, puis recharge celle de la boutique sélectionnée', async () => {
    await renderForm();
    await waitFor(() => expect(screen.getByDisplayValue('pk_test_ff')).toBeTruthy());
    expect(screen.getByText('● Compte Stripe configuré')).toBeTruthy();

    fireEvent.change(storeSelect(), { target: { value: 'store-pv' } });
    await waitFor(() => expect(screen.getByText('○ Compte Stripe non configuré')).toBeTruthy());
    expect((screen.getByPlaceholderText('pk_test_xxxxxxxxxxxx') as HTMLInputElement).value).toBe('');
  });

  it('un fallback organisation (inherited) est affiché explicitement, jamais confondu avec une config propre', async () => {
    inheritedStores.add('store-pv');
    stripeConfigs['store-pv'] = {
      enabled: true, publishable_key: 'pk_test_org', secret_key_masked: 'sk_test•••…_org', secret_key_set: true,
      webhook_secret_masked: 'whsec_•••…_org', webhook_secret_set: true, return_url: '',
    };
    await renderForm();
    fireEvent.change(storeSelect(), { target: { value: 'store-pv' } });
    await waitFor(() => expect(screen.getByText(/Configuration héritée de l.organisation/)).toBeTruthy());
    expect(screen.getByText('Configurer Stripe pour cette boutique')).toBeTruthy();
  });

  it("l'enregistrement pour Fanny Fleurs envoie store_id=store-ff, jamais un PATCH sans store_id", async () => {
    await renderForm();
    fireEvent.change(screen.getByPlaceholderText('pk_test_xxxxxxxxxxxx'), { target: { value: 'pk_test_ff_updated' } });
    fireEvent.click(screen.getByText('Enregistrer Stripe'));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]!.body.store_id).toBe('store-ff');
  });

  it("après changement de boutique, l'enregistrement pour Plante Verte envoie store_id=store-pv, jamais celui de Fanny Fleurs", async () => {
    await renderForm();
    fireEvent.change(storeSelect(), { target: { value: 'store-pv' } });
    await waitFor(() => expect(screen.getByText('○ Compte Stripe non configuré')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('pk_test_xxxxxxxxxxxx'), { target: { value: 'pk_test_pv_new' } });
    fireEvent.click(screen.getByText('Enregistrer Stripe'));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]!.body.store_id).toBe('store-pv');
    expect(patchCalls[0]!.body.store_id).not.toBe('store-ff');
  });

  it("le champ secret masqué n'est jamais pré-rempli avec sa valeur affichée (jamais réenregistré comme vrai secret)", async () => {
    await renderForm();
    // La clé secrète masquée s'affiche dans un encart en lecture seule...
    expect(screen.getByText('sk_test•••…_ff')).toBeTruthy();
    // ...mais le champ de SAISIE reste vide (jamais pré-rempli avec le masque).
    // Deux champs partagent ce placeholder (clé secrète, secret webhook) :
    // le premier dans l'ordre du DOM est la clé secrète.
    const secretInput = screen.getAllByPlaceholderText('Laisser vide pour conserver')[0] as HTMLInputElement;
    expect(secretInput.value).toBe('');

    // Enregistrer SANS toucher au champ ne doit jamais envoyer le masque
    // affiché comme "nouveau secret".
    fireEvent.click(screen.getByText('Enregistrer Stripe'));
    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0]!.body.secret_key).toBeUndefined();
  });

  it('organisation à une seule boutique : le sélecteur est masqué (comme le reste de cette page)', async () => {
    render(<PaymentMethodsForm canWrite stores={[{ id: 'store-unique', name: 'Boutique Unique' }]} />);
    await waitFor(() => screen.getByText('Configuration Stripe'));
    expect(screen.queryByText('Boutique')).toBeNull();
  });
});
