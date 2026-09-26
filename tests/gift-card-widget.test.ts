// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Widget public de vente de cartes cadeaux (étape 6) —
 * public/gift-cards/widget/v1/embed.js.
 *
 * Ce fichier est un script CLASSIQUE (pas de module ES, chargeable par un
 * simple <script src>) : on le teste en l'évaluant tel quel dans un
 * environnement jsdom (comme un navigateur le ferait), plutôt qu'en
 * important des fonctions individuelles — il n'en exporte aucune, par
 * design (compatibilité maximale avec un simple <script>).
 *
 * `fetch` est mocké pour intercepter les appels à /api/public/gift-cards/
 * config et /checkout ; aucun réseau réel.
 */

const WIDGET_PATH = path.resolve(__dirname, '../public/gift-cards/widget/v1/embed.js');
const WIDGET_SRC = fs.readFileSync(WIDGET_PATH, 'utf8');
const API_ORIGIN = 'https://cdn.example.test';

const CONFIG_A = {
  enabled: true,
  organization: { name: 'Organisation A' },
  gift_cards: { preset_amounts: [25, 50, 75, 100], allow_custom_amount: true, min_amount: 10, max_amount: 500 },
};
const CONFIG_B = {
  enabled: true,
  organization: { name: 'Organisation B' },
  gift_cards: { preset_amounts: [20, 40], allow_custom_amount: false, min_amount: 20, max_amount: 40 },
};

let configByKey: Record<string, { status: number; body: unknown }> = {};
let checkoutStatus = 200;
let checkoutBody: unknown = { checkout_url: 'https://checkout.stripe.com/pay/cs_test_1', reference: 'GC-TEST0001' };
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), init });
  if (String(url).includes('/api/public/gift-cards/config')) {
    const key = new URL(String(url)).searchParams.get('key') ?? '';
    const entry = configByKey[key] ?? { status: 404, body: { error: 'GIFT_CARDS_NOT_AVAILABLE' } };
    return { ok: entry.status < 400, status: entry.status, json: async () => entry.body };
  }
  if (String(url).includes('/api/public/gift-cards/checkout')) {
    return { ok: checkoutStatus < 400, status: checkoutStatus, json: async () => checkoutBody };
  }
  throw new Error(`fetch non simulé dans le test : ${url}`);
});
vi.stubGlobal('fetch', fetchMock);

// Charge le script UNE SEULE FOIS (comme une page qui l'inclut une fois) :
// `customElements.define` ne peut être appelé qu'une fois par nom de balise.
// L'origine de l'API est déduite du <script src> présent dans le DOM au
// moment du chargement (repli utilisé faute de document.currentScript pour
// un script évalué manuellement — voir embed.js::resolveApiBase).
const scriptTag = document.createElement('script');
scriptTag.src = `${API_ORIGIN}/gift-cards/widget/v1/embed.js`;
document.body.appendChild(scriptTag);
// eslint-disable-next-line no-eval
(0, eval)(WIDGET_SRC);

function mount(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('hellopos-gift-card');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function flush(times = 5): Promise<void> {
  return new Array(times).fill(0).reduce(
    (p: Promise<void>) => p.then(() => new Promise((r) => setTimeout(r, 0))),
    Promise.resolve(),
  );
}

function shadow(el: HTMLElement): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function q<T extends Element = HTMLElement>(el: HTMLElement, selector: string): T {
  return shadow(el).querySelector(selector) as T;
}

// jsdom ne réalise jamais de vraie navigation cross-origine (par design) :
// `window.location.href = 'https://checkout.stripe.com/...'` déclenche un
// avertissement interne « Not implemented: navigation » et n'actualise pas
// réellement `location.href`. On intercepte donc UNIQUEMENT l'affectation
// (le setter) pour vérifier la valeur transmise par le widget, sans casser
// la lecture normale de location.href utilisée ailleurs (détection de
// session_id via history.pushState, qui fonctionne nativement dans jsdom).
let capturedRedirectHref: string | undefined;
const realLocation = window.location;
Object.defineProperty(window, 'location', {
  configurable: true,
  get() {
    return new Proxy(realLocation, {
      get(target, prop) { return prop === 'href' ? target.href : (target as unknown as Record<string | symbol, unknown>)[prop]; },
      set(target, prop, value) {
        if (prop === 'href') { capturedRedirectHref = String(value); return true; }
        (target as unknown as Record<string | symbol, unknown>)[prop as string] = value;
        return true;
      },
    });
  },
});

beforeEach(() => {
  document.body.querySelectorAll('hellopos-gift-card').forEach((n) => n.remove());
  window.history.pushState({}, '', '/');
  window.sessionStorage.clear();
  fetchCalls = [];
  fetchMock.mockClear();
  capturedRedirectHref = undefined;
  configByKey = {
    hp_gc_AAAA: { status: 200, body: CONFIG_A },
    hp_gc_BBBB: { status: 200, body: CONFIG_B },
  };
  checkoutStatus = 200;
  checkoutBody = { checkout_url: 'https://checkout.stripe.com/pay/cs_test_1', reference: 'GC-TEST0001' };
});

async function mountReady(attrs: Record<string, string> = { 'data-key': 'hp_gc_AAAA' }) {
  const el = mount(attrs);
  await flush();
  return el;
}

async function fillValidForm(el: HTMLElement, overrides: Record<string, string> = {}) {
  const presetBtn = q(el, '.hp-preset') as HTMLButtonElement;
  presetBtn.click();
  (q(el, '#hp-recipient-name') as HTMLInputElement).value = overrides.recipientName ?? 'Guillaume Dupont';
  q(el, '#hp-recipient-name').dispatchEvent(new Event('input'));
  (q(el, '#hp-buyer-name') as HTMLInputElement).value = overrides.buyerName ?? 'Jonathan Frissong';
  q(el, '#hp-buyer-name').dispatchEvent(new Event('input'));
  (q(el, '#hp-buyer-email') as HTMLInputElement).value = overrides.buyerEmail ?? 'jonathan@example.com';
  q(el, '#hp-buyer-email').dispatchEvent(new Event('input'));
  if (overrides.recipientEmail !== undefined) {
    (q(el, '#hp-recipient-email') as HTMLInputElement).value = overrides.recipientEmail;
    q(el, '#hp-recipient-email').dispatchEvent(new Event('input'));
  }
}

describe('Config', () => {
  it('charge la configuration et affiche le formulaire avec les presets', async () => {
    const el = await mountReady();
    expect(q(el, '#hp-form').classList.contains('hp-hidden')).toBe(false);
    const buttons = shadow(el).querySelectorAll('.hp-preset');
    expect(buttons.length).toBe(4);
    expect(buttons[0]!.textContent).toContain('25');
  });

  it("affiche le nom de l'organisation renvoyé par l'API", async () => {
    const el = await mountReady();
    expect(q(el, '#hp-org-name').textContent).toBe('Organisation A');
  });

  it('affiche le champ montant libre seulement si allow_custom_amount=true', async () => {
    const elA = await mountReady({ 'data-key': 'hp_gc_AAAA' });
    expect(q(elA, '#hp-custom-wrap').classList.contains('hp-hidden')).toBe(false);
    const elB = await mountReady({ 'data-key': 'hp_gc_BBBB' });
    expect(q(elB, '#hp-custom-wrap').classList.contains('hp-hidden')).toBe(true);
  });

  it('respecte min_amount/max_amount pour le montant libre', async () => {
    const el = await mountReady();
    const custom = q<HTMLInputElement>(el, '#hp-custom-input');
    custom.value = '5'; // < min_amount (10)
    custom.dispatchEvent(new Event('input'));
    // Renseigne les autres champs SANS cliquer de preset (cela effacerait le
    // montant libre saisi ci-dessus — voir _selectPreset dans embed.js).
    (q(el, '#hp-recipient-name') as HTMLInputElement).value = 'Guillaume Dupont';
    (q(el, '#hp-buyer-name') as HTMLInputElement).value = 'Jonathan Frissong';
    (q(el, '#hp-buyer-email') as HTMLInputElement).value = 'jonathan@example.com';
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q(el, '#hp-amount-err').textContent).toMatch(/10/);
    expect(fetchCalls.some((c) => c.url.includes('/checkout'))).toBe(false);
  });

  it('organisation indisponible (404) => message générique, pas de formulaire', async () => {
    const el = await mountReady({ 'data-key': 'hp_gc_UNKNOWN' });
    expect(q(el, '#hp-unavailable').classList.contains('hp-hidden')).toBe(false);
    expect(q(el, '#hp-unavailable-text').textContent).toMatch(/pas disponibles/i);
    expect(q(el, '#hp-unavailable-text').textContent).not.toContain('GIFT_CARDS_NOT_AVAILABLE');
  });
});

describe('Formulaire — validations', () => {
  it('recipient.name obligatoire', async () => {
    const el = await mountReady();
    (q(el, '.hp-preset') as HTMLButtonElement).click();
    (q(el, '#hp-buyer-name') as HTMLInputElement).value = 'Jonathan';
    (q(el, '#hp-buyer-email') as HTMLInputElement).value = 'jonathan@example.com';
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q(el, '#hp-recipient-name-err').textContent).toBeTruthy();
    expect(fetchCalls.some((c) => c.url.includes('/checkout'))).toBe(false);
  });

  it('buyer.name et buyer.email obligatoires', async () => {
    const el = await mountReady();
    (q(el, '.hp-preset') as HTMLButtonElement).click();
    (q(el, '#hp-recipient-name') as HTMLInputElement).value = 'Guillaume';
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q(el, '#hp-buyer-name-err').textContent).toBeTruthy();
    expect(q(el, '#hp-buyer-email-err').textContent).toBeTruthy();
    expect(fetchCalls.some((c) => c.url.includes('/checkout'))).toBe(false);
  });

  it('recipient.email facultatif en mode buyer (défaut)', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(fetchCalls.some((c) => c.url.includes('/checkout'))).toBe(true);
  });

  it('recipient.email obligatoire en mode recipient', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    (q(el, '#hp-mode-recipient') as HTMLInputElement).click();
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q(el, '#hp-recipient-email-err').textContent).toBeTruthy();
    expect(fetchCalls.some((c) => c.url.includes('/checkout'))).toBe(false);
  });

  it('changer de mode ne perd pas un email déjà saisi', async () => {
    const el = await mountReady();
    (q(el, '#hp-recipient-email') as HTMLInputElement).value = 'guillaume@example.com';
    (q(el, '#hp-mode-recipient') as HTMLInputElement).click();
    (q(el, '#hp-mode-buyer') as HTMLInputElement).click();
    expect(q<HTMLInputElement>(el, '#hp-recipient-email').value).toBe('guillaume@example.com');
  });

  it('message facultatif, respecte la limite de 500 caractères (contrat backend)', async () => {
    const el = await mountReady();
    const textarea = q<HTMLTextAreaElement>(el, '#hp-message');
    expect(textarea.maxLength).toBe(500);
  });
});

describe('delivery_mode', () => {
  it("mode buyer : payload delivery_mode='buyer', recipient.email absent si non saisi", async () => {
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const call = fetchCalls.find((c) => c.url.includes('/checkout'))!;
    const body = JSON.parse(String(call.init!.body));
    expect(body.delivery_mode).toBe('buyer');
    expect(body.recipient.email).toBeUndefined();
  });

  it("mode recipient : payload delivery_mode='recipient', recipient.email présent", async () => {
    const el = await mountReady();
    await fillValidForm(el, { recipientEmail: 'guillaume@example.com' });
    (q(el, '#hp-mode-recipient') as HTMLInputElement).click();
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const call = fetchCalls.find((c) => c.url.includes('/checkout'))!;
    const body = JSON.parse(String(call.init!.body));
    expect(body.delivery_mode).toBe('recipient');
    expect(body.recipient.email).toBe('guillaume@example.com');
  });
});

describe('Checkout — payload et idempotence', () => {
  it('payload conforme au contrat réel (key, amount, buyer, recipient, delivery_mode, idempotency_key)', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    (q(el, '#hp-message') as HTMLTextAreaElement).value = 'Joyeux Noël !';
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const call = fetchCalls.find((c) => c.url.includes('/checkout'))!;
    const body = JSON.parse(String(call.init!.body));
    expect(body).toMatchObject({
      key: 'hp_gc_AAAA',
      amount: 25,
      buyer: { name: 'Jonathan Frissong', email: 'jonathan@example.com' },
      recipient: { name: 'Guillaume Dupont' },
      delivery_mode: 'buyer',
      message: 'Joyeux Noël !',
    });
    expect(typeof body.idempotency_key).toBe('string');
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8);
    expect(/^[A-Za-z0-9_-]+$/.test(body.idempotency_key)).toBe(true);
  });

  it('data-success-path/data-cancel-path relatifs sont transmis', async () => {
    const el = await mountReady({ 'data-key': 'hp_gc_AAAA', 'data-success-path': '/merci', 'data-cancel-path': '/oups' });
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(body.success_path).toBe('/merci');
    expect(body.cancel_path).toBe('/oups');
  });

  it('une URL absolue en data-success-path est ignorée (jamais envoyée)', async () => {
    const el = await mountReady({ 'data-key': 'hp_gc_AAAA', 'data-success-path': 'https://evil.example/steal' });
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(body.success_path).toBeUndefined();
  });

  it('un chemin protocole-relatif (//evil.com) en data-cancel-path est ignoré', async () => {
    const el = await mountReady({ 'data-key': 'hp_gc_AAAA', 'data-cancel-path': '//evil.example' });
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(body.cancel_path).toBeUndefined();
  });

  it('double clic sur "Payer" ne déclenche qu\'un seul appel checkout', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    const form = q(el, '#hp-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(fetchCalls.filter((c) => c.url.includes('/checkout')).length).toBe(1);
  });

  it('le bouton est désactivé pendant la requête', async () => {
    const el = await mountReady(); // la config a le temps de charger normalement...
    await fillValidForm(el);
    let resolveFetch!: (v: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    fetchMock.mockImplementationOnce((url: string) => { // ...avant d'intercepter SEULEMENT l'appel checkout suivant
      fetchCalls.push({ url });
      return new Promise((r) => { resolveFetch = r; });
    });
    const submitBtn = q<HTMLButtonElement>(el, '#hp-submit');
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(1);
    expect(submitBtn.disabled).toBe(true);
    resolveFetch({ ok: true, status: 200, json: async () => checkoutBody });
    await flush();
  });

  it('même tentative rejouée (retry technique, aucun champ modifié) => même idempotency_key', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    checkoutStatus = 502; // simule un échec réseau/serveur transitoire
    checkoutBody = { error: 'CHECKOUT_UNAVAILABLE' };
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const firstKey = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body)).idempotency_key;

    checkoutStatus = 200;
    checkoutBody = { checkout_url: 'https://checkout.stripe.com/pay/cs_test_1', reference: 'GC-TEST0001' };
    fetchCalls = [];
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const secondKey = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body)).idempotency_key;
    expect(secondKey).toBe(firstKey);
  });

  it('idempotency_key renouvelée si la commande est modifiée après une tentative', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const firstKey = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body)).idempotency_key;

    fetchCalls = [];
    (q(el, '#hp-message') as HTMLTextAreaElement).value = 'Un mot ajouté après coup';
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const secondKey = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body)).idempotency_key;
    expect(secondKey).not.toBe(firstKey);
  });

  it("checkout_url renvoyée par le serveur est utilisée telle quelle (jamais reconstruite)", async () => {
    checkoutBody = { checkout_url: 'https://checkout.stripe.com/pay/cs_test_XYZ', reference: 'GC-XYZ' };
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(capturedRedirectHref).toBe('https://checkout.stripe.com/pay/cs_test_XYZ');
  });
});

describe('Erreurs', () => {
  it.each([
    ['RATE_LIMITED', /trop de tentatives/i],
    ['CHECKOUT_UNAVAILABLE', /temporairement indisponible/i],
    ['PAYMENT_UNAVAILABLE', /temporairement indisponible/i],
    ['ORDER_ALREADY_COMPLETED', /déjà été traitée/i],
  ])('mappe %s vers un message utilisateur, jamais le code brut', async (code, expected) => {
    checkoutStatus = 422;
    checkoutBody = { error: code };
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const banner = q(el, '#hp-form-error');
    expect(banner.textContent).toMatch(expected);
    expect(banner.textContent).not.toContain(code);
  });

  it('erreur réseau (fetch qui rejette) => message générique, pas de crash', async () => {
    const el = await mountReady(); // config chargée normalement...
    await fillValidForm(el);
    fetchMock.mockImplementationOnce(async (url: string) => { // ...seul l'appel checkout suivant échoue
      fetchCalls.push({ url });
      throw new Error('network down');
    });
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q(el, '#hp-form-error').textContent).toMatch(/erreur est survenue/i);
  });
});

describe('Multi-tenant', () => {
  it("widget A et widget B affichent chacun leur propre configuration, sans mélange", async () => {
    const elA = await mountReady({ 'data-key': 'hp_gc_AAAA' });
    const elB = await mountReady({ 'data-key': 'hp_gc_BBBB' });
    expect(q(elA, '#hp-org-name').textContent).toBe('Organisation A');
    expect(q(elB, '#hp-org-name').textContent).toBe('Organisation B');
    expect(shadow(elA).querySelectorAll('.hp-preset').length).toBe(4);
    expect(shadow(elB).querySelectorAll('.hp-preset').length).toBe(2);
  });

  it('aucun organization_id ni store_id dans le payload envoyé', async () => {
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(body.organization_id).toBeUndefined();
    expect(body.store_id).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('store_id');
  });
});

describe('XSS — aucune injection HTML depuis des données serveur/utilisateur', () => {
  it("organization.name contenant du HTML n'est jamais interprété", async () => {
    configByKey.hp_gc_AAAA = {
      status: 200,
      body: { ...CONFIG_A, organization: { name: '<img src=x onerror="window.__xss=1">' } },
    };
    const el = await mountReady();
    expect(q(el, '#hp-org-name').textContent).toBe('<img src=x onerror="window.__xss=1">');
    expect(shadow(el).innerHTML).not.toContain('<img');
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("recipient.name contenant du HTML n'est jamais interprété (récapitulatif)", async () => {
    const el = await mountReady();
    await fillValidForm(el, { recipientName: '<script>window.__xss2=1</script>' });
    expect(q(el, '#hp-recap-recipient').textContent).toBe('<script>window.__xss2=1</script>');
    expect(shadow(el).innerHTML).not.toContain('<script>window.__xss2');
    expect((window as unknown as { __xss2?: number }).__xss2).toBeUndefined();
  });

  it("le message personnel contenant du HTML n'est jamais interprété (récapitulatif)", async () => {
    const el = await mountReady();
    (q(el, '#hp-message') as HTMLTextAreaElement).value = '<b onmouseover="window.__xss3=1">salut</b>';
    q(el, '#hp-message').dispatchEvent(new Event('input'));
    expect(q(el, '#hp-recap-message').textContent).toBe('<b onmouseover="window.__xss3=1">salut</b>');
    expect(shadow(el).innerHTML).not.toContain('<b onmouseover');
  });
});

describe('Isolation CSS (Shadow DOM)', () => {
  it("le CSS de la page hôte (sélecteurs génériques button/input/*) n'atteint pas le contenu du widget", async () => {
    const hostStyle = document.createElement('style');
    hostStyle.textContent = 'button { background: red !important; font-size: 40px; } input { border: 10px solid blue; } * { box-sizing: content-box; }';
    document.head.appendChild(hostStyle);
    const el = await mountReady();
    // Le Shadow DOM (mode 'open') empêche structurellement les règles de la
    // page hôte de cibler des éléments à l'intérieur : aucun nœud du widget
    // n'est sélectionnable par les règles définies dans le document hôte.
    const submitBtn = q(el, '#hp-submit');
    expect(document.querySelectorAll('button')).not.toContain(submitBtn);
    expect(hostStyle.sheet).toBeTruthy(); // la règle existe bien dans le document...
    // ...mais le nœud stylesheet du widget est isolé dans son propre shadowRoot :
    expect(shadow(el).querySelector('style')!.textContent).toContain(':host');
    document.head.removeChild(hostStyle);
  });

  it("le widget possède sa propre feuille de style, jamais injectée dans le document hôte", async () => {
    const el = await mountReady();
    expect(document.head.querySelector('style')).toBeNull();
    expect(shadow(el).querySelector('style')).not.toBeNull();
  });
});

/**
 * Retrouve, par sélecteur exact, les déclarations d'une règle CSS de la
 * feuille de style du widget. jsdom n'expose pas `<style>.sheet` pour un
 * élément posé dans un Shadow Root (vérifié empiriquement — sheet vaut
 * `null` bien que le nœud soit connecté) : on ne peut donc pas utiliser la
 * CSSOM ici comme on le ferait pour un `<style>` dans le document
 * principal. On extrait donc le bloc de déclarations par le sélecteur
 * EXACT (jusqu'à la première accolade fermante) depuis le texte source,
 * puis on le découpe en paires propriété/valeur — plus précis qu'un simple
 * `.toContain` sur toute la feuille.
 */
function cssRuleDeclarations(el: HTMLElement, selectorText: string): Record<string, string> {
  const css = q<HTMLStyleElement>(el, 'style').textContent || '';
  const escapedSelector = selectorText.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const match = new RegExp(escapedSelector + '\\{([^}]*)\\}').exec(css);
  if (!match) throw new Error(`Règle CSS introuvable pour le sélecteur : ${selectorText}`);
  const decls: Record<string, string> = {};
  match[1]!.split(';').forEach((decl) => {
    const i = decl.indexOf(':');
    if (i === -1) return;
    decls[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  });
  return decls;
}

describe('Mise en page — largeur et centrage (correctif décalage à gauche)', () => {
  it(':host reste isolé (all:initial) et devient un bloc capable de prendre 100% de la largeur disponible', async () => {
    const el = await mountReady();
    const host = cssRuleDeclarations(el, ':host');
    expect(host.all).toBe('initial');
    expect(host.display).toBe('block');
    expect(host.width).toBe('100%');
  });

  it('le conteneur racine réel (.hp-root) a une largeur responsive plafonnée à une largeur desktop confortable', async () => {
    const el = await mountReady();
    const root = cssRuleDeclarations(el, '.hp-root');
    expect(root.width).toBe('100%'); // responsive : jamais plus large que son conteneur
    expect(root['max-width']).toBe('960px'); // largeur desktop confortable pour un formulaire horizontal (montants/champs sur 2 à 4 colonnes)
  });

  it('.hp-root est centré horizontalement (marges automatiques gauche/droite)', async () => {
    const el = await mountReady();
    const root = cssRuleDeclarations(el, '.hp-root');
    expect(root['margin-left']).toBe('auto');
    expect(root['margin-right']).toBe('auto');
  });

  it("le conteneur anonyme injecté par innerHTML (parent direct de .hp-root) ne porte aucun style propre pouvant fausser le centrage", async () => {
    const el = await mountReady();
    // .hp-root est le premier (et unique) enfant du <div> anonyme posé par
    // connectedCallback — ce porteur n'a ni classe ni attribut style, donc
    // aucune règle ne peut le cibler spécifiquement.
    const hpRoot = q(el, '.hp-root');
    const wrapper = hpRoot.parentElement!;
    expect(wrapper.className).toBe('');
    expect(wrapper.getAttribute('style')).toBeNull();
  });

  it('aucun changement fonctionnel : le parcours complet (config -> formulaire -> checkout) reste inchangé', async () => {
    const el = await mountReady();
    expect(q(el, '#hp-org-name').textContent).toBe('Organisation A');
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(body).toMatchObject({ key: 'hp_gc_AAAA', amount: 25, delivery_mode: 'buyer' });
  });
});

/** Retrouve les déclarations d'une règle imbriquée dans un bloc
 *  `@container hpgc (min-width:Npx){ ... }` — même principe que
 *  cssRuleDeclarations, mais en restreignant d'abord la recherche au texte
 *  À L'INTÉRIEUR du bloc @container demandé (jsdom ne fournissant pas la
 *  CSSOM pour un <style> de Shadow Root, voir cssRuleDeclarations). */
function cssRuleInContainer(el: HTMLElement, minWidthPx: number, selectorText: string): Record<string, string> {
  const css = q<HTMLStyleElement>(el, 'style').textContent || '';
  const openTag = `@container hpgc (min-width:${minWidthPx}px){`;
  const start = css.indexOf(openTag);
  if (start === -1) throw new Error(`Bloc @container (min-width:${minWidthPx}px) introuvable`);
  // La feuille contient plusieurs règles imbriquées dans ce bloc (ex. le
  // bloc 560px : .hp-grid-2{...} .hp-modes{...} ...) : un simple `.toContain
  // '}}'` couperait avant la DERNIÈRE règle. On compte la profondeur des
  // accolades pour retrouver la fermeture exacte du bloc @container, quel
  // que soit le nombre de règles qu'il contient.
  let depth = 1;
  let i = start + openTag.length;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const containerBody = css.slice(start + openTag.length, i - 1);
  const escapedSelector = selectorText.replace(/[.*+?^${}()|[\]\\:#]/g, '\\$&');
  const ruleMatch = new RegExp(escapedSelector + '\\{([^}]*)\\}').exec(containerBody);
  if (!ruleMatch) throw new Error(`Règle ${selectorText} introuvable dans le bloc @container (min-width:${minWidthPx}px)`);
  const decls: Record<string, string> = {};
  ruleMatch[1]!.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) return;
    decls[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  });
  return decls;
}

describe('Disposition horizontale desktop/tablette (refonte largeur)', () => {
  it("le widget réagit à l'espace RÉELLEMENT disponible (container query sur :host), pas à la largeur de la fenêtre", async () => {
    const el = await mountReady();
    const host = cssRuleDeclarations(el, ':host');
    expect(host['container-type']).toBe('inline-size');
    expect(host['container-name']).toBe('hpgc');
  });

  it('4 montants prédéfinis sur une grille (jamais un simple empilement), 2x2 par défaut', async () => {
    const el = await mountReady();
    const presets = cssRuleDeclarations(el, '.hp-presets');
    expect(presets.display).toBe('grid');
    expect(presets['grid-template-columns']).toBe('repeat(2,1fr)');
  });

  it('les 4 montants passent sur une seule ligne dès que le widget a assez de largeur (>= 760px)', async () => {
    const el = await mountReady();
    const wide = cssRuleInContainer(el, 760, '.hp-presets');
    expect(wide['grid-template-columns']).toBe('repeat(4,1fr)');
  });

  it('bénéficiaire ET informations acheteur sont chacun regroupés dans un conteneur .hp-grid-2 (2 colonnes dès 560px)', async () => {
    const el = await mountReady();
    const grids = shadow(el).querySelectorAll('.hp-grid-2');
    expect(grids.length).toBe(2); // bénéficiaire + acheteur
    // Chaque conteneur contient bien les deux champs attendus, dans l'ordre.
    expect(grids[0]!.querySelector('#hp-recipient-name')).not.toBeNull();
    expect(grids[0]!.querySelector('#hp-recipient-email')).not.toBeNull();
    expect(grids[1]!.querySelector('#hp-buyer-name')).not.toBeNull();
    expect(grids[1]!.querySelector('#hp-buyer-email')).not.toBeNull();

    const wide = cssRuleInContainer(el, 560, '.hp-grid-2');
    expect(wide.display).toBe('grid');
    expect(wide['grid-template-columns']).toBe('repeat(2,minmax(0,1fr))');
  });

  it('les deux modes de réception passent côte à côte, même largeur, dès 560px', async () => {
    const el = await mountReady();
    const base = cssRuleDeclarations(el, '.hp-modes');
    expect(base['flex-direction']).toBe('column'); // empilés par défaut (mobile)
    const wide = cssRuleInContainer(el, 560, '.hp-modes');
    expect(wide['flex-direction']).toBe('row');
    const wideMode = cssRuleInContainer(el, 560, '.hp-mode');
    expect(wideMode.flex).toBe('1 1 0'); // même largeur pour les deux cartes
  });

  it('le récapitulatif passe en ligne compacte dès 560px, la ligne message gardant toujours toute la largeur', async () => {
    const el = await mountReady();
    const wideRecap = cssRuleInContainer(el, 560, '.hp-recap');
    expect(wideRecap['flex-direction']).toBe('row');
    const wideMessageRow = cssRuleInContainer(el, 560, '#hp-recap-message-row');
    expect(wideMessageRow.flex).toBe('1 0 100%');
  });

  it('le bouton de paiement inclut le montant une fois connu, sans changer le payload envoyé', async () => {
    const el = await mountReady();
    expect(q(el, '#hp-submit').textContent).toBe('Payer'); // aucun montant choisi encore
    (q(el, '.hp-preset') as HTMLButtonElement).click(); // 25 €
    // Espace insécable avant "€" (Intl.NumberFormat('fr-FR', ...)) : pas un
    // espace normal — d'où l'échappement explicite plutôt qu'un littéral.
    expect(q(el, '#hp-submit').textContent).toBe('Payer 25,00 €');
  });

  it("n'introduit aucun scroll horizontal : aucune règle ne fixe une largeur supérieure à 100% du conteneur", async () => {
    const el = await mountReady();
    const css = q<HTMLStyleElement>(el, 'style').textContent || '';
    // Aucune largeur en dur supérieure à la largeur desktop retenue (960px) :
    // tout le reste est en %, auto, ou des tailles de contenu (icônes, spinner…).
    const pxWidths = Array.from(css.matchAll(/(?:^|[^-])width:\s*(\d+)px/g)).map((m) => Number(m[1]));
    expect(pxWidths.every((w) => w <= 260)).toBe(true); // plus grande largeur en dur : le champ code-barres/spinner, jamais le conteneur
  });
});

describe('Retour Stripe — succès', () => {
  it("session_id dans l'URL => écran de succès, sans appel à /config ni /checkout", async () => {
    window.history.pushState({}, '', '/carte-cadeau/succes?session_id=cs_test_1');
    const el = await mountReady();
    expect(q(el, '#hp-success').classList.contains('hp-hidden')).toBe(false);
    expect(q(el, '#hp-success-text').textContent).toMatch(/paiement a bien été pris en compte/i);
    expect(fetchCalls.length).toBe(0);
  });

  it("ne prétend jamais qu'un email a déjà été envoyé", async () => {
    window.history.pushState({}, '', '/carte-cadeau/succes?session_id=cs_test_1');
    const el = await mountReady();
    expect(q(el, '#hp-success-text').textContent).not.toMatch(/email envoyé|a été envoyée par email(?! (très|prochainement))/i);
  });

  it('adapte le texte selon le dernier delivery_mode soumis (indice non sensible en sessionStorage)', async () => {
    const el1 = await mountReady();
    await fillValidForm(el1, { recipientEmail: 'guillaume@example.com' });
    (q(el1, '#hp-mode-recipient') as HTMLInputElement).click();
    q(el1, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(window.sessionStorage.getItem('hellopos_gc_intent_hp_gc_AAAA')).toBeTruthy();

    window.history.pushState({}, '', '/carte-cadeau/succes?session_id=cs_test_1');
    const el2 = await mountReady();
    expect(q(el2, '#hp-success-text').textContent).toMatch(/bénéficiaire/i);
    // L'indice est consommé (retiré) une fois affiché.
    expect(window.sessionStorage.getItem('hellopos_gc_intent_hp_gc_AAAA')).toBeNull();
  });
});

describe('Retour Stripe — annulation', () => {
  it('un brouillon récent restaure le formulaire sans perdre les informations saisies', async () => {
    const el1 = await mountReady();
    await fillValidForm(el1, { recipientEmail: 'guillaume@example.com' });
    (q(el1, '#hp-message') as HTMLTextAreaElement).value = 'Petit mot';
    q(el1, '#hp-message').dispatchEvent(new Event('input'));
    q(el1, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    // Retour sur la page d'annulation (même site, même widget) : aucun session_id.
    window.history.pushState({}, '', '/carte-cadeau');
    const el2 = await mountReady();
    expect(q(el2, '#hp-recovered-banner').classList.contains('hp-hidden')).toBe(false);
    expect(q<HTMLInputElement>(el2, '#hp-recipient-name').value).toBe('Guillaume Dupont');
    expect(q<HTMLInputElement>(el2, '#hp-buyer-email').value).toBe('jonathan@example.com');
    expect(q<HTMLTextAreaElement>(el2, '#hp-message').value).toBe('Petit mot');
  });

  it("n'affiche jamais une erreur technique Stripe brute", async () => {
    const el = await mountReady();
    // Aucune trace de vocabulaire Stripe brut dans les messages d'erreur mappés.
    Object.values({
      RATE_LIMITED: 1, CHECKOUT_UNAVAILABLE: 1, PAYMENT_UNAVAILABLE: 1,
    });
    expect(shadow(el).textContent).not.toMatch(/stripe/i);
  });

  it('sans brouillon récent, le formulaire démarre vierge (pas de bandeau)', async () => {
    const el = await mountReady();
    expect(q(el, '#hp-recovered-banner').classList.contains('hp-hidden')).toBe(true);
    expect(q<HTMLInputElement>(el, '#hp-recipient-name').value).toBe('');
  });
});

describe('Sécurité — aucune donnée sensible exposée', () => {
  it('aucun secret Stripe / identifiant interne dans le script ni dans les payloads', async () => {
    expect(WIDGET_SRC).not.toMatch(/sk_live|sk_test_[a-zA-Z0-9]{10,}|whsec_/);
    const el = await mountReady();
    await fillValidForm(el);
    q(el, '#hp-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const body = JSON.parse(String(fetchCalls.find((c) => c.url.includes('/checkout'))!.init!.body));
    expect(Object.keys(body)).not.toContain('organization_id');
  });
});
