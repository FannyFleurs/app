/*!
 * HelloPos — Widget public de vente de cartes cadeaux (étape 6).
 * Documentation d'intégration : docs/gift-card-widget.md
 * Contrat API consommé (source de vérité, jamais dupliqué en dur ici) :
 *   GET  /api/public/gift-cards/config?key=...   (docs/api-public-gift-cards.md)
 *   POST /api/public/gift-cards/checkout          (docs/api-public-gift-cards.md)
 *
 * Script CLASSIQUE (pas de module ES) : chargeable par un simple
 * <script src="…/embed.js">, compatible avec n'importe quel site
 * (WordPress, HTML statique, React, autre CMS…) sans étape de build côté
 * intégrateur. Aucune dépendance externe.
 *
 * Définit l'élément personnalisé <hellopos-gift-card>, rendu dans un Shadow
 * DOM fermé pour une isolation CSS totale dans les deux sens (voir
 * docs/gift-card-widget.md, section « Isolation CSS »).
 *
 * Ce fichier ne contient et ne reçoit JAMAIS : organization_id, store_id,
 * clé secrète Stripe, identifiants HelloPos, ou tout autre secret. Il ne
 * connaît que la clé PUBLIQUE (hp_gc_...) fournie par l'intégrateur.
 */
(function () {
  'use strict';

  var TAG_NAME = 'hellopos-gift-card';
  if (typeof window === 'undefined' || typeof window.customElements === 'undefined') return;
  if (customElements.get(TAG_NAME)) return; // déjà défini (script inclus deux fois)

  // ---------------------------------------------------------------------
  // Résolution de l'origine de l'API HelloPos — DÉDUITE de l'URL du script
  // lui-même (jamais codée en dur) : le même fichier fonctionne sans
  // modification en local, en préversion (*.vercel.app) et en production.
  // ---------------------------------------------------------------------
  function resolveApiBase() {
    try {
      if (document.currentScript && document.currentScript.src) {
        return new URL(document.currentScript.src).origin;
      }
    } catch (e) { /* ignore */ }
    // Repli : le script n'est plus "currentScript" au moment de l'exécution
    // (ex. chargement différé) — on retrouve la balise par son chemin connu.
    var scripts = document.querySelectorAll('script[src*="/gift-cards/widget/"]');
    for (var i = 0; i < scripts.length; i++) {
      try { return new URL(scripts[i].getAttribute('src'), window.location.href).origin; } catch (e) { /* ignore */ }
    }
    // Dernier repli : même origine que la page hôte (montage manuel du script).
    return window.location.origin;
  }
  var API_BASE = resolveApiBase();

  // ---------------------------------------------------------------------
  // Constantes partagées avec le contrat backend (voir les fichiers cités
  // en commentaire) — dupliquées ici UNIQUEMENT pour un retour immédiat côté
  // UX ; le serveur reste la seule source de vérité et revalide tout.
  // ---------------------------------------------------------------------
  var MAX_NAME_LEN = 160;      // app/api/public/gift-cards/checkout/route.ts (buyerSchema/recipientSchema)
  var MAX_EMAIL_LEN = 200;     // idem
  var MAX_MESSAGE_LEN = 500;   // idem
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // indicatif UX seulement — .email() de zod tranche côté serveur

  var DEFAULT_PRIMARY = '#2F6F4F'; // même accent que l'email de distribution (lib/email/gift-card-template.ts)
  var DEFAULT_TEXT = '#14211D';
  var DEFAULT_RADIUS = '14px';

  var DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes — au-delà, un brouillon n'est plus proposé au rechargement

  // Mapping erreurs publiques -> messages utilisateur (jamais les codes bruts,
  // voir docs/gift-card-widget.md § « Erreurs »). Le code technique va
  // uniquement en console.error.
  var ERROR_MESSAGES = {
    GIFT_CARDS_NOT_AVAILABLE: 'Les cartes cadeaux ne sont pas disponibles actuellement.',
    ORIGIN_NOT_ALLOWED: 'Ce site n’est pas autorisé à vendre des cartes cadeaux pour le moment.',
    VALIDATION_ERROR: 'Merci de vérifier les informations saisies.',
    INVALID_AMOUNT: 'Le montant choisi n’est pas valide. Merci de sélectionner un autre montant.',
    INVALID_RETURN_PATH: 'Une erreur de configuration empêche le paiement. Merci de réessayer plus tard.',
    RATE_LIMITED: 'Trop de tentatives ont été effectuées. Réessayez dans quelques instants.',
    IDEMPOTENCY_KEY_CONFLICT: 'Une erreur inattendue est survenue. Merci de recharger la page et réessayer.',
    ORDER_ALREADY_COMPLETED: 'Cette commande a déjà été traitée.',
    ORDER_EXPIRED_RETRY_WITH_NEW_KEY: 'Merci de réessayer.',
    PAYMENT_UNAVAILABLE: 'Le paiement est temporairement indisponible. Réessayez dans quelques instants.',
    CHECKOUT_UNAVAILABLE: 'Le paiement est temporairement indisponible. Réessayez dans quelques instants.',
  };
  var GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

  function formatEUR(n) {
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      return n.toFixed(2) + ' €';
    }
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function randomKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // Repli (navigateurs très anciens) : conforme à ^[A-Za-z0-9_-]{8,100}$
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }

  /** Chemin relatif strictement local — même principe que validateReturnPath
   *  côté serveur (lib/settings/online-gift-cards.ts), en repli client : un
   *  chemin visiblement invalide est ignoré ICI (le backend défaut s'applique)
   *  plutôt que d'envoyer une valeur qui échouerait de toute façon en 422. */
  function sanitizeReturnPath(raw) {
    if (!raw) return undefined;
    var v = String(raw).trim();
    if (!v || v.length > 200) return undefined;
    if (v.charAt(0) !== '/' || v.charAt(1) === '/' || v.indexOf('://') !== -1 || v.indexOf('\\') !== -1) {
      console.warn('[hellopos-gift-card] chemin de retour ignoré (invalide) :', raw);
      return undefined;
    }
    return v;
  }

  function clampColor(raw, fallback) {
    if (!raw) return fallback;
    var v = String(raw).trim();
    // Autorise seulement une couleur CSS simple (hex ou nom) — jamais injecté
    // en HTML, seulement posé comme valeur d'une custom property CSS.
    if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^[a-zA-Z]{3,20}$/.test(v)) return v;
    return fallback;
  }

  // ---------------------------------------------------------------------
  // Feuille de style du Shadow DOM — isole totalement le widget du CSS de
  // la page hôte (et inversement). `all: initial` sur :host neutralise
  // l'HÉRITAGE des propriétés CSS (police, couleur…) qui, contrairement aux
  // règles/sélecteurs, traverse normalement la frontière du Shadow DOM.
  // ---------------------------------------------------------------------
  var STYLE = ''
    // width:100% (en plus de display:block) : le composant occupe toute la
    // largeur que le site intégrateur lui laisse, quel que soit le contexte
    // de mise en page (bloc normal, cellule flex/grid…) — un bloc width:auto
    // ne s'étire pas forcément à 100% dans tous ces contextes. Cette
    // propriété est déclarée dans la MÊME règle qu'all:initial : au sein
    // d'une seule règle, l'ordre des propriétés ne compte pas (seul l'ordre
    // entre déclarations de LA MÊME propriété compterait) — display:block et
    // les variables --hp-* ci-dessous coexistent déjà avec all:initial
    // exactement de cette façon.
    + ':host{all:initial;display:block;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;'
    + '--hp-primary:' + DEFAULT_PRIMARY + ';--hp-text:' + DEFAULT_TEXT + ';--hp-radius:' + DEFAULT_RADIUS + ';}'
    + '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}'
    // .hp-root est le conteneur racine RÉEL du contenu visible (premier —
    // et unique — élément du gabarit statique posé dans le Shadow DOM,
    // voir TEMPLATE ci-dessous ; le <div> qui l'englobe directement,
    // injecté par innerHTML lors du montage, n'est qu'un porteur anonyme
    // sans classe ni style, donc sans effet sur la mise en page).
    // max-width:480px (largeur confortable pour un formulaire à une
    // colonne, cohérente avec les champs/labels existants — inchangée
    // depuis l'étape 6) plafonnait déjà correctement la largeur sur
    // desktop, mais margin:0 auto manquait : un bloc plus étroit que son
    // conteneur s'aligne par défaut à GAUCHE, jamais centré, sans cette
    // marge. C'est la cause exacte du décalage rapporté — le custom
    // element (:host) peut être large et centré sur la page hôte, mais
    // .hp-root, lui, restait collé au bord gauche À L'INTÉRIEUR de cette
    // largeur.
    + '.hp-root{color:var(--hp-text);font-size:16px;line-height:1.45;max-width:480px;width:100%;margin-left:auto;margin-right:auto;}'
    + '.hp-panel{background:#fff;border:1px solid #E7E3D8;border-radius:var(--hp-radius);padding:20px;}'
    + '@media (max-width:400px){.hp-panel{padding:16px;border-radius:calc(var(--hp-radius) - 4px);}}'
    + '.hp-section{margin-top:20px;}'
    + '.hp-section:first-child{margin-top:0;}'
    + '.hp-h{font-size:15px;font-weight:700;margin-bottom:8px;color:var(--hp-text);}'
    + '.hp-sub{font-size:13px;color:#5A625E;margin-top:-4px;margin-bottom:10px;}'
    + '.hp-org{font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--hp-primary);margin-bottom:4px;}'
    + '.hp-title{font-size:19px;font-weight:700;margin-bottom:16px;}'
    + '.hp-presets{display:flex;flex-wrap:wrap;gap:8px;}'
    + '.hp-preset{flex:1 1 calc(50% - 8px);min-width:88px;padding:12px 10px;border:1.5px solid #E7E3D8;border-radius:calc(var(--hp-radius) - 4px);'
    + 'background:#fff;font-size:16px;font-weight:600;color:var(--hp-text);cursor:pointer;min-height:44px;text-align:center;}'
    + '.hp-preset:hover{border-color:var(--hp-primary);}'
    + '.hp-preset:focus-visible{outline:2px solid var(--hp-primary);outline-offset:1px;}'
    + '.hp-preset[aria-pressed="true"]{border-color:var(--hp-primary);background:color-mix(in srgb, var(--hp-primary) 10%, white);}'
    + '.hp-field{margin-top:12px;}'
    + '.hp-field:first-child{margin-top:0;}'
    + 'label{display:block;font-size:13px;font-weight:600;margin-bottom:5px;}'
    + '.hp-optional{font-weight:400;color:#5A625E;}'
    + 'input[type="text"],input[type="email"],input[type="number"],textarea{'
    + 'width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1.5px solid #E7E3D8;border-radius:calc(var(--hp-radius) - 6px);'
    + 'background:#fff;color:var(--hp-text);min-height:44px;}'
    + 'textarea{resize:vertical;min-height:64px;}'
    + 'input:focus-visible,textarea:focus-visible{outline:2px solid var(--hp-primary);outline-offset:1px;border-color:var(--hp-primary);}'
    + 'input[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:#B42318;}'
    + '.hp-count{font-size:12px;color:#5A625E;text-align:right;margin-top:3px;}'
    + '.hp-err{font-size:13px;color:#B42318;margin-top:5px;display:none;}'
    + '.hp-err.hp-show{display:block;}'
    + '.hp-modes{display:flex;flex-direction:column;gap:8px;}'
    + '.hp-mode{display:flex;gap:10px;align-items:flex-start;border:1.5px solid #E7E3D8;border-radius:calc(var(--hp-radius) - 4px);padding:12px;cursor:pointer;}'
    + '.hp-mode:has(input:checked){border-color:var(--hp-primary);background:color-mix(in srgb, var(--hp-primary) 8%, white);}'
    + '.hp-mode input{margin-top:3px;width:18px;height:18px;accent-color:var(--hp-primary);flex:none;}'
    + '.hp-mode-title{font-weight:600;font-size:15px;}'
    + '.hp-mode-desc{font-size:13px;color:#5A625E;margin-top:2px;}'
    + '.hp-recap{background:color-mix(in srgb, var(--hp-primary) 6%, white);border-radius:calc(var(--hp-radius) - 4px);padding:14px;font-size:14px;}'
    + '.hp-recap-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;}'
    + '.hp-recap-row b{font-weight:700;}'
    + '.hp-submit{width:100%;margin-top:16px;padding:14px;border:none;border-radius:calc(var(--hp-radius) - 4px);'
    + 'background:var(--hp-primary);color:#fff;font-size:16px;font-weight:700;cursor:pointer;min-height:48px;}'
    + '.hp-submit:disabled{opacity:.6;cursor:not-allowed;}'
    + '.hp-submit:focus-visible{outline:2px solid var(--hp-text);outline-offset:2px;}'
    + '.hp-secure{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:#5A625E;margin-top:10px;}'
    + '.hp-banner{font-size:13px;padding:10px 12px;border-radius:calc(var(--hp-radius) - 6px);margin-bottom:14px;}'
    + '.hp-banner-info{background:#EDF1ED;color:#3A4A3D;}'
    + '.hp-banner-cancel{background:#FBEFE6;color:#7A4A1F;}'
    + '.hp-hidden{display:none !important;}'
    + '.hp-center{text-align:center;padding:8px 4px;}'
    + '.hp-spinner{width:22px;height:22px;border:3px solid #E7E3D8;border-top-color:var(--hp-primary);border-radius:50%;'
    + 'display:inline-block;animation:hp-spin .7s linear infinite;}'
    + '@keyframes hp-spin{to{transform:rotate(360deg);}}'
    + '@media (prefers-reduced-motion: reduce){.hp-spinner{animation-duration:2.2s;}}'
    + '.hp-success-icon{width:48px;height:48px;border-radius:50%;background:color-mix(in srgb, var(--hp-primary) 15%, white);'
    + 'display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;}'
    + 'button,input,textarea{font-family:inherit;}'
    + 'a{color:var(--hp-primary);}';

  // Gabarit HTML STATIQUE (aucune interpolation de donnée dynamique — les
  // valeurs venant du serveur/de l'utilisateur sont TOUJOURS posées ensuite
  // via textContent, jamais concaténées ici : voir docs/gift-card-widget.md
  // § « Protection XSS »).
  var TEMPLATE = ''
    + '<div class="hp-root" part="root">'
    + '  <div id="hp-loading" class="hp-panel hp-center" role="status" aria-live="polite">'
    + '    <span class="hp-spinner" aria-hidden="true"></span>'
    + '  </div>'
    + '  <div id="hp-unavailable" class="hp-panel hp-center hp-hidden" role="alert">'
    + '    <p id="hp-unavailable-text"></p>'
    + '  </div>'
    + '  <div id="hp-success" class="hp-panel hp-center hp-hidden" role="status" aria-live="polite">'
    + '    <div class="hp-success-icon" aria-hidden="true">✓</div>'
    + '    <h2 class="hp-title" id="hp-success-title" style="margin-bottom:8px;"></h2>'
    + '    <p id="hp-success-text"></p>'
    + '  </div>'
    + '  <form id="hp-form" class="hp-panel hp-hidden" novalidate>'
    + '    <div id="hp-recovered-banner" class="hp-banner hp-banner-cancel hp-hidden">Le paiement n’a pas été finalisé. Vos informations ont été conservées — vous pouvez réessayer.</div>'
    + '    <div class="hp-org" id="hp-org-name"></div>'
    + '    <div class="hp-title">Carte cadeau</div>'
    + '    <div id="hp-form-error" class="hp-banner hp-banner-cancel hp-hidden" role="alert"></div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">1. Choisissez le montant</div>'
    + '      <div id="hp-presets" class="hp-presets"></div>'
    + '      <div id="hp-custom-wrap" class="hp-field hp-hidden">'
    + '        <label for="hp-custom-input">Autre montant (€)</label>'
    + '        <input type="number" id="hp-custom-input" inputmode="decimal" min="0" step="0.01" aria-describedby="hp-amount-err">'
    + '      </div>'
    + '      <p id="hp-amount-err" class="hp-err" role="alert"></p>'
    + '    </div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">2. Pour qui est la carte ?</div>'
    + '      <div class="hp-field">'
    + '        <label for="hp-recipient-name">Nom du bénéficiaire *</label>'
    + '        <input type="text" id="hp-recipient-name" autocomplete="off" maxlength="160" required aria-describedby="hp-recipient-name-err">'
    + '        <p id="hp-recipient-name-err" class="hp-err" role="alert"></p>'
    + '      </div>'
    + '      <div class="hp-field">'
    + '        <label for="hp-recipient-email" id="hp-recipient-email-label">Email du bénéficiaire <span class="hp-optional">(facultatif)</span></label>'
    + '        <input type="email" id="hp-recipient-email" autocomplete="off" maxlength="200" aria-describedby="hp-recipient-email-err">'
    + '        <p id="hp-recipient-email-err" class="hp-err" role="alert"></p>'
    + '      </div>'
    + '    </div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">3. Vos informations</div>'
    + '      <div class="hp-field">'
    + '        <label for="hp-buyer-name">Nom *</label>'
    + '        <input type="text" id="hp-buyer-name" autocomplete="name" maxlength="160" required aria-describedby="hp-buyer-name-err">'
    + '        <p id="hp-buyer-name-err" class="hp-err" role="alert"></p>'
    + '      </div>'
    + '      <div class="hp-field">'
    + '        <label for="hp-buyer-email">Email *</label>'
    + '        <input type="email" id="hp-buyer-email" autocomplete="email" maxlength="200" required aria-describedby="hp-buyer-email-err">'
    + '        <p id="hp-buyer-email-err" class="hp-err" role="alert"></p>'
    + '      </div>'
    + '    </div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">4. Ajouter un petit mot <span class="hp-optional">(facultatif)</span></div>'
    + '      <div class="hp-field">'
    + '        <label for="hp-message" class="hp-hidden">Message</label>'
    + '        <textarea id="hp-message" maxlength="500" rows="2" aria-describedby="hp-message-count hp-message-err"></textarea>'
    + '        <p id="hp-message-count" class="hp-count"></p>'
    + '        <p id="hp-message-err" class="hp-err" role="alert"></p>'
    + '      </div>'
    + '    </div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">5. Mode de réception</div>'
    + '      <div class="hp-modes" role="radiogroup" aria-label="Mode de réception">'
    + '        <label class="hp-mode">'
    + '          <input type="radio" name="hp-delivery-mode" id="hp-mode-buyer" value="buyer" checked>'
    + '          <span><span class="hp-mode-title">Je reçois la carte cadeau</span>'
    + '          <span class="hp-mode-desc">Nous vous envoyons la carte par email. Vous pourrez l’imprimer, la transférer ou l’offrir plus tard.</span></span>'
    + '        </label>'
    + '        <label class="hp-mode">'
    + '          <input type="radio" name="hp-delivery-mode" id="hp-mode-recipient" value="recipient">'
    + '          <span><span class="hp-mode-title">Envoyer directement au bénéficiaire</span>'
    + '          <span class="hp-mode-desc">Le bénéficiaire reçoit sa carte cadeau par email après le paiement.</span></span>'
    + '        </label>'
    + '      </div>'
    + '    </div>'

    + '    <div class="hp-section">'
    + '      <div class="hp-h">Récapitulatif</div>'
    + '      <div class="hp-recap">'
    + '        <div class="hp-recap-row"><span>Carte cadeau</span><b id="hp-recap-amount">—</b></div>'
    + '        <div class="hp-recap-row"><span>Pour</span><b id="hp-recap-recipient">—</b></div>'
    + '        <div class="hp-recap-row"><span>Envoi</span><b id="hp-recap-delivery">—</b></div>'
    + '        <div class="hp-recap-row hp-hidden" id="hp-recap-message-row"><span>Message</span><b id="hp-recap-message">—</b></div>'
    + '      </div>'
    + '      <button type="submit" class="hp-submit" id="hp-submit">Payer</button>'
    + '      <div class="hp-secure">🔒 Paiement sécurisé</div>'
    + '    </div>'
    + '  </form>'
    + '</div>';

  // Un élément personnalisé DOIT étendre HTMLElement via `class`/`super()` —
  // impossible à faire avec un simple constructeur de fonction (les
  // navigateurs interdisent d'appeler HTMLElement comme une fonction). Les
  // méthodes restent ajoutées classiquement sur le prototype ci-dessous.
  class HelloPosGiftCard extends HTMLElement {
    constructor() { super(); }
  }

  HelloPosGiftCard.prototype.connectedCallback = function () {
    if (this._initialized) return;
    this._initialized = true;

    this._key = (this.getAttribute('data-key') || '').trim();
    this._successPath = sanitizeReturnPath(this.getAttribute('data-success-path'));
    this._cancelPath = sanitizeReturnPath(this.getAttribute('data-cancel-path'));

    // Personnalisation VISUELLE uniquement (jamais de portée fonctionnelle :
    // ne touche ni organization_id, ni montant, ni Stripe, ni delivery_mode).
    var primary = clampColor(this.getAttribute('data-primary-color'), null);
    var text = clampColor(this.getAttribute('data-text-color'), null);
    var radius = this.getAttribute('data-radius');
    if (primary) this.style.setProperty('--hp-primary', primary);
    if (text) this.style.setProperty('--hp-text', text);
    if (radius && /^[0-9]{1,2}px$/.test(String(radius).trim())) this.style.setProperty('--hp-radius', radius.trim());

    var shadow = this.attachShadow({ mode: 'open' });
    var styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    shadow.appendChild(styleEl);
    var wrap = document.createElement('div');
    wrap.innerHTML = TEMPLATE; // gabarit 100% statique, voir commentaire plus haut
    shadow.appendChild(wrap);
    this._root = shadow;

    if (!this._key) {
      this._showUnavailable('Configuration manquante : attribut data-key requis.');
      console.error('[hellopos-gift-card] attribut data-key manquant sur <hellopos-gift-card>.');
      return;
    }

    this._state = { config: null, deliveryMode: 'buyer', selectedPreset: null, submitting: false, idemKey: null, idemFingerprint: null };
    this._wireStaticEvents();
    this._init();
  };

  var proto = HelloPosGiftCard.prototype;

  proto._el = function (id) { return this._root.getElementById(id); };

  proto._showPanel = function (name) {
    var panels = ['hp-loading', 'hp-unavailable', 'hp-success', 'hp-form'];
    for (var i = 0; i < panels.length; i++) {
      var el = this._el(panels[i]);
      if (el) el.classList.toggle('hp-hidden', panels[i] !== name);
    }
  };

  proto._showUnavailable = function (text) {
    this._el('hp-unavailable-text').textContent = text;
    this._showPanel('hp-unavailable');
  };

  // -------------------------------------------------------------------
  // sessionStorage — brouillon technique uniquement (jamais localStorage,
  // jamais l'URL). Portée par clé publique pour ne jamais mélanger deux
  // widgets/organisations sur une même page. Voir docs/gift-card-widget.md
  // § « Vie privée / stockage ».
  // -------------------------------------------------------------------
  proto._draftKey = function () { return 'hellopos_gc_draft_' + this._key; };

  proto._saveDraft = function () {
    try {
      var d = {
        ts: Date.now(),
        amount: this._currentAmount(),
        recipientName: this._el('hp-recipient-name').value,
        recipientEmail: this._el('hp-recipient-email').value,
        buyerName: this._el('hp-buyer-name').value,
        buyerEmail: this._el('hp-buyer-email').value,
        message: this._el('hp-message').value,
        deliveryMode: this._state.deliveryMode,
        idemKey: this._state.idemKey,
        idemFingerprint: this._state.idemFingerprint,
      };
      window.sessionStorage.setItem(this._draftKey(), JSON.stringify(d));
    } catch (e) { /* stockage indisponible (navigation privée…) : tant pis, pas bloquant */ }
  };

  proto._loadDraft = function () {
    try {
      var raw = window.sessionStorage.getItem(this._draftKey());
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d.ts !== 'number' || Date.now() - d.ts > DRAFT_TTL_MS) return null;
      return d;
    } catch (e) { return null; }
  };

  proto._clearDraft = function () {
    try { window.sessionStorage.removeItem(this._draftKey()); } catch (e) { /* ignore */ }
  };

  proto._intentKey = function () { return 'hellopos_gc_intent_' + this._key; };
  proto._saveIntent = function () {
    try {
      window.sessionStorage.setItem(this._intentKey(), JSON.stringify({
        deliveryMode: this._state.deliveryMode,
        recipientName: this._el('hp-recipient-name').value,
      }));
    } catch (e) { /* ignore */ }
  };
  proto._readAndClearIntent = function () {
    try {
      var raw = window.sessionStorage.getItem(this._intentKey());
      window.sessionStorage.removeItem(this._intentKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  // -------------------------------------------------------------------
  // Initialisation : retour succès (session_id présent) > brouillon
  // d'annulation récent > formulaire neuf.
  // -------------------------------------------------------------------
  proto._init = function () {
    var hasSessionId = false;
    try { hasSessionId = new URL(window.location.href).searchParams.has('session_id'); } catch (e) { /* ignore */ }

    if (hasSessionId) {
      this._clearDraft();
      var intent = this._readAndClearIntent();
      this._renderSuccess(intent);
      return; // pas besoin de charger la config pour l'écran de succès
    }

    var self = this;
    this._fetchConfig().then(function (cfg) {
      if (!cfg) return; // _fetchConfig a déjà affiché l'état indisponible
      self._state.config = cfg;
      self._el('hp-org-name').textContent = cfg.organization.name; // textContent -> jamais de HTML injecté
      self._renderPresets(cfg.gift_cards);
      self._el('hp-custom-wrap').classList.toggle('hp-hidden', !cfg.gift_cards.allow_custom_amount);

      var draft = self._loadDraft();
      if (draft) self._applyDraft(draft);

      self._updateDeliveryModeUI();
      self._updateRecap();
      self._showPanel('hp-form');
      if (draft) self._el('hp-recovered-banner').classList.remove('hp-hidden');
    });
  };

  proto._fetchConfig = function () {
    var self = this;
    return fetch(API_BASE + '/api/public/gift-cards/config?key=' + encodeURIComponent(this._key))
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            self._showUnavailable(ERROR_MESSAGES[body.error] || ERROR_MESSAGES.GIFT_CARDS_NOT_AVAILABLE);
            console.error('[hellopos-gift-card] config indisponible :', body.error || res.status);
            return null;
          });
        }
        return res.json();
      })
      .catch(function (err) {
        self._showUnavailable(GENERIC_ERROR);
        console.error('[hellopos-gift-card] échec de chargement de la configuration :', err);
        return null;
      });
  };

  proto._renderPresets = function (giftCards) {
    var wrap = this._el('hp-presets');
    wrap.textContent = '';
    var self = this;
    (giftCards.preset_amounts || []).forEach(function (amount) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hp-preset';
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = formatEUR(amount); // valeur numérique serveur -> textContent, pas d'injection possible
      btn.addEventListener('click', function () { self._selectPreset(amount, btn); });
      wrap.appendChild(btn);
    });
  };

  proto._selectPreset = function (amount, btnEl) {
    var wrap = this._el('hp-presets');
    Array.prototype.forEach.call(wrap.children, function (b) { b.setAttribute('aria-pressed', 'false'); });
    btnEl.setAttribute('aria-pressed', 'true');
    this._state.selectedPreset = amount;
    this._el('hp-custom-input').value = '';
    this._clearFieldError('hp-amount-err');
    this._updateRecap();
  };

  proto._currentAmount = function () {
    var custom = this._el('hp-custom-input').value;
    if (custom !== '' && !this._el('hp-custom-wrap').classList.contains('hp-hidden')) {
      var n = parseFloat(custom);
      return isNaN(n) ? null : round2(n);
    }
    return this._state.selectedPreset;
  };

  proto._validateAmount = function () {
    var cfg = this._state.config.gift_cards;
    var amount = this._currentAmount();
    if (amount === null || amount === undefined) return 'Choisissez un montant.';
    var isPreset = (cfg.preset_amounts || []).some(function (p) { return round2(p) === amount; });
    if (isPreset) return null;
    if (!cfg.allow_custom_amount) return 'Choisissez un montant proposé.';
    if (amount < cfg.min_amount || amount > cfg.max_amount) {
      return 'Le montant doit être compris entre ' + formatEUR(cfg.min_amount) + ' et ' + formatEUR(cfg.max_amount) + '.';
    }
    return null;
  };

  proto._updateDeliveryModeUI = function () {
    var mode = this._el('hp-mode-recipient').checked ? 'recipient' : 'buyer';
    this._state.deliveryMode = mode;
    var required = mode === 'recipient';
    var input = this._el('hp-recipient-email');
    var label = this._el('hp-recipient-email-label');
    input.required = required;
    input.setAttribute('aria-required', required ? 'true' : 'false');
    // Bascule uniquement l'indication obligatoire/facultatif — ne touche
    // jamais à input.value : la valeur déjà saisie n'est jamais perdue.
    var optSpan = label.querySelector('.hp-optional');
    optSpan.textContent = required ? '' : '(facultatif)';
    optSpan.classList.toggle('hp-hidden', required);
    if (required) {
      var star = label.querySelector('.hp-req-star');
      if (!star) {
        star = document.createElement('span');
        star.className = 'hp-req-star';
        star.textContent = ' *';
        label.appendChild(star);
      }
    } else {
      var existingStar = label.querySelector('.hp-req-star');
      if (existingStar) existingStar.remove();
    }
    this._clearFieldError('hp-recipient-email-err');
  };

  proto._updateRecap = function () {
    var amount = this._currentAmount();
    this._el('hp-recap-amount').textContent = amount ? formatEUR(amount) : '—';
    this._el('hp-recap-recipient').textContent = this._el('hp-recipient-name').value.trim() || '—';
    this._el('hp-recap-delivery').textContent = this._state.deliveryMode === 'recipient' ? 'Envoyé au bénéficiaire' : 'Envoyé à moi-même';
    var msg = this._el('hp-message').value.trim();
    this._el('hp-recap-message-row').classList.toggle('hp-hidden', !msg);
    this._el('hp-recap-message').textContent = msg;
    var count = this._el('hp-message-count');
    count.textContent = this._el('hp-message').value.length + ' / ' + MAX_MESSAGE_LEN;
  };

  proto._applyDraft = function (d) {
    this._el('hp-recipient-name').value = d.recipientName || '';
    this._el('hp-recipient-email').value = d.recipientEmail || '';
    this._el('hp-buyer-name').value = d.buyerName || '';
    this._el('hp-buyer-email').value = d.buyerEmail || '';
    this._el('hp-message').value = d.message || '';
    if (d.deliveryMode === 'recipient') this._el('hp-mode-recipient').checked = true; else this._el('hp-mode-buyer').checked = true;
    this._state.idemKey = d.idemKey || null;
    this._state.idemFingerprint = d.idemFingerprint || null;

    // Ré-affiche le montant : bouton preset correspondant (une fois les
    // presets rendus) si le montant en fait partie, sinon champ libre.
    if (typeof d.amount === 'number') {
      var cfg = this._state.config.gift_cards;
      var isPreset = (cfg.preset_amounts || []).some(function (p) { return round2(p) === d.amount; });
      if (isPreset) {
        var presetBtn = Array.prototype.filter.call(this._el('hp-presets').children, function (b) {
          return b.textContent === formatEUR(d.amount);
        })[0];
        if (presetBtn) this._selectPreset(d.amount, presetBtn);
      } else {
        this._el('hp-custom-input').value = String(d.amount);
        this._state.selectedPreset = null;
      }
    }
  };

  proto._clearFieldError = function (id) {
    var el = this._el(id);
    el.textContent = '';
    el.classList.remove('hp-show');
    var input = this._root.querySelector('[aria-describedby~="' + id + '"]');
    if (input) input.removeAttribute('aria-invalid');
  };

  proto._setFieldError = function (id, message, inputId) {
    var el = this._el(id);
    el.textContent = message;
    el.classList.add('hp-show');
    if (inputId) this._el(inputId).setAttribute('aria-invalid', 'true');
  };

  proto._wireStaticEvents = function () {
    var self = this;
    this._el('hp-custom-input').addEventListener('input', function () {
      self._state.selectedPreset = null;
      Array.prototype.forEach.call(self._el('hp-presets').children, function (b) { b.setAttribute('aria-pressed', 'false'); });
      self._clearFieldError('hp-amount-err');
      self._updateRecap();
    });
    ['hp-recipient-name', 'hp-recipient-email', 'hp-buyer-name', 'hp-buyer-email', 'hp-message'].forEach(function (id) {
      self._el(id).addEventListener('input', function () { self._updateRecap(); });
    });
    this._el('hp-mode-buyer').addEventListener('change', function () { self._updateDeliveryModeUI(); self._updateRecap(); });
    this._el('hp-mode-recipient').addEventListener('change', function () { self._updateDeliveryModeUI(); self._updateRecap(); });
    this._el('hp-form').addEventListener('submit', function (ev) { ev.preventDefault(); self._submit(); });
  };

  // -------------------------------------------------------------------
  // Validation complète (miroir du contrat serveur, pour un retour
  // immédiat) — la validation serveur reste la source de vérité.
  // -------------------------------------------------------------------
  proto._validateForm = function () {
    var ok = true;
    var amountErr = this._validateAmount();
    if (amountErr) { this._setFieldError('hp-amount-err', amountErr); ok = false; } else this._clearFieldError('hp-amount-err');

    var recipientName = this._el('hp-recipient-name').value.trim();
    if (!recipientName) { this._setFieldError('hp-recipient-name-err', 'Le nom du bénéficiaire est obligatoire.', 'hp-recipient-name'); ok = false; }
    else this._clearFieldError('hp-recipient-name-err');

    var recipientEmail = this._el('hp-recipient-email').value.trim();
    if (this._state.deliveryMode === 'recipient' && !recipientEmail) {
      this._setFieldError('hp-recipient-email-err', 'L’email du bénéficiaire est obligatoire pour un envoi direct.', 'hp-recipient-email');
      ok = false;
    } else if (recipientEmail && !EMAIL_RE.test(recipientEmail)) {
      this._setFieldError('hp-recipient-email-err', 'Cet email ne semble pas valide.', 'hp-recipient-email');
      ok = false;
    } else this._clearFieldError('hp-recipient-email-err');

    var buyerName = this._el('hp-buyer-name').value.trim();
    if (!buyerName) { this._setFieldError('hp-buyer-name-err', 'Votre nom est obligatoire.', 'hp-buyer-name'); ok = false; }
    else this._clearFieldError('hp-buyer-name-err');

    var buyerEmail = this._el('hp-buyer-email').value.trim();
    if (!buyerEmail) { this._setFieldError('hp-buyer-email-err', 'Votre email est obligatoire.', 'hp-buyer-email'); ok = false; }
    else if (!EMAIL_RE.test(buyerEmail)) { this._setFieldError('hp-buyer-email-err', 'Cet email ne semble pas valide.', 'hp-buyer-email'); ok = false; }
    else this._clearFieldError('hp-buyer-email-err');

    return ok;
  };

  /** Empreinte du contenu de la commande — sert à savoir si l'idempotency_key
   *  en cours reste valide (retry technique de la MÊME tentative) ou doit
   *  être renouvelée (l'utilisateur a modifié la commande). */
  proto._fingerprint = function () {
    return JSON.stringify([
      this._currentAmount(),
      this._el('hp-buyer-name').value.trim(),
      this._el('hp-buyer-email').value.trim(),
      this._el('hp-recipient-name').value.trim(),
      this._el('hp-recipient-email').value.trim(),
      this._el('hp-message').value.trim(),
      this._state.deliveryMode,
    ]);
  };

  proto._idempotencyKey = function () {
    var fp = this._fingerprint();
    if (!this._state.idemKey || this._state.idemFingerprint !== fp) {
      this._state.idemKey = randomKey();
      this._state.idemFingerprint = fp;
    }
    return this._state.idemKey;
  };

  proto._submit = function () {
    if (this._state.submitting) return; // garde anti-double-clic (en plus de l'idempotency_key serveur)
    if (!this._validateForm()) return;
    this._el('hp-form-error').classList.add('hp-hidden');

    this._state.submitting = true;
    var submitBtn = this._el('hp-submit');
    submitBtn.disabled = true;
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Traitement…';

    var payload = {
      key: this._key,
      amount: this._currentAmount(),
      buyer: { name: this._el('hp-buyer-name').value.trim(), email: this._el('hp-buyer-email').value.trim() },
      recipient: { name: this._el('hp-recipient-name').value.trim() },
      delivery_mode: this._state.deliveryMode,
      idempotency_key: this._idempotencyKey(),
    };
    var recipientEmail = this._el('hp-recipient-email').value.trim();
    if (recipientEmail) payload.recipient.email = recipientEmail;
    var message = this._el('hp-message').value.trim();
    if (message) payload.message = message;
    if (this._successPath) payload.success_path = this._successPath;
    if (this._cancelPath) payload.cancel_path = this._cancelPath;

    this._saveDraft(); // conserve la tentative avant de quitter la page (retour Stripe)

    var self = this;
    fetch(API_BASE + '/api/public/gift-cards/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { res: res, body: body }; });
      })
      .then(function (r) {
        if (r.res.ok && r.body.checkout_url) {
          self._saveIntent();
          window.location.href = r.body.checkout_url; // jamais construite côté client
          return;
        }
        if (r.body.error === 'ORDER_EXPIRED_RETRY_WITH_NEW_KEY') {
          self._state.idemKey = null; // clé rendue caduque côté serveur : en générer une nouvelle au prochain essai
        }
        self._fail(r.body.error);
      })
      .catch(function (err) {
        console.error('[hellopos-gift-card] échec du paiement :', err);
        self._fail(undefined);
      })
      .finally(function () {
        self._state.submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      });
  };

  proto._fail = function (code) {
    var msg = ERROR_MESSAGES[code] || GENERIC_ERROR;
    if (code) console.error('[hellopos-gift-card] checkout refusé :', code);
    var banner = this._el('hp-form-error');
    banner.textContent = msg;
    banner.classList.remove('hp-hidden');
  };

  proto._renderSuccess = function (intent) {
    var title = 'Votre carte cadeau est prête';
    var text = 'Votre paiement a bien été pris en compte. Votre carte cadeau est en cours de préparation.';
    if (intent && intent.deliveryMode === 'recipient') {
      text = 'Votre paiement a bien été pris en compte. La carte cadeau va être envoyée au bénéficiaire par email.';
    } else if (intent && intent.deliveryMode === 'buyer') {
      text = 'Votre paiement a bien été pris en compte. Votre carte cadeau va vous être envoyée par email.';
    }
    this._el('hp-success-title').textContent = title;
    this._el('hp-success-text').textContent = text;
    this._showPanel('hp-success');
  };

  customElements.define(TAG_NAME, HelloPosGiftCard);
})();
