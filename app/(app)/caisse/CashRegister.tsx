'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import { getOrCreateDeviceId } from '@/lib/device';
import OfflineBanner from '@/components/OfflineBanner';
import { enqueueSale } from '@/lib/offline/queue';
import { offlinePosEnabled } from '@/lib/offline/sync';
import RegisterPicker from './RegisterPicker';
import { type PickedCustomer } from './CustomerPickerModal';
import { type OnboardingStatus } from './WelcomeOnboarding';
import dynamic from 'next/dynamic';
import Icon from '@/components/Icon';
import CategoryIcon, { categoryIconDef } from '@/lib/category-icons';
import { useSchoolMode, isSchoolCustomerId } from '@/lib/school-mode';
import { tileMetrics, type PosUiSettings } from '@/lib/settings/pos-ui';
import { confirmThemed } from '@/lib/ui/dialog';

// Modales chargées à la demande : aucune ne s'affiche au premier rendu, donc
// on les sort du bundle initial de la caisse (temps d'affichage plus court).
const BarcodeScannerModal = dynamic(() => import('./BarcodeScannerModal'), { ssr: false });
const PaymentModal = dynamic(() => import('./PaymentModal'), { ssr: false });
const ReceiptPreviewModal = dynamic(() => import('./ReceiptPreviewModal'), { ssr: false });
const HoldListModal = dynamic(() => import('./HoldListModal'), { ssr: false });
const OpenSessionModal = dynamic(() => import('./OpenSessionModal'), { ssr: false });
const WelcomeOnboarding = dynamic(() => import('./WelcomeOnboarding'), { ssr: false });
const FreePriceModal = dynamic(() => import('./FreePriceModal'), { ssr: false });
const CustomerPickerModal = dynamic(() => import('./CustomerPickerModal'), { ssr: false });
const LineDiscountModal = dynamic(() => import('./LineDiscountModal'), { ssr: false });
const JustificationModal = dynamic(() => import('./JustificationModal'), { ssr: false });
const CartActionsModal = dynamic(() => import('./CartActionsModal'), { ssr: false });
const OrderModal = dynamic(() => import('./OrderModal'), { ssr: false });

export interface PosProduct {
  id: string;
  name: string;
  sale_price_ttc: number;
  price_is_free: boolean;
  tax_rate: number;
  tax_rate_id: string;
  tax_rate_code: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  barcode: string | null;
  extra_barcodes?: string[] | null;
  sku: string | null;
  image_url: string | null;
  short_description: string | null;
  is_customizable: boolean;
  is_top_product: boolean;
  /** Pack d'articles : à la vente, éclate en ses composants (chacun décompté du stock). */
  is_pack?: boolean;
  /** Si true, AUCUNE remise (client ou globale) n'est appliquée. Cartes cadeaux. */
  no_discount?: boolean;
  /** Remise propre à l'article (fiche produit) — appliquée au scan/à l'ajout. */
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  /** Couleur de fond #RRGGBB pour la tuile caisse (migration 0018). */
  color?: string | null;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  /** Clé d'icône (cf. lib/category-icons). Null = tuile en aplat de couleur. */
  icon: string | null;
  image_url: string | null;
  visible_in_pos?: boolean;
}

export interface CartLine {
  key: string;
  product_id: string | null;
  variant_id: string | null;
  label: string;
  unit_price_ttc: number;
  quantity: number;
  discount_amount: number;
  tax_rate: number;
  tax_rate_code: string;
  metadata: Record<string, unknown>;
}

export interface TaxRate { id: string; code: string; rate: number; is_default: boolean; }

interface Props {
  stores: { id: string; code: string; name: string }[];
  registers: {
    id: string; store_id: string; code: string; name: string;
    device_id: string | null; device_name: string | null;
  }[];
  taxRates: TaxRate[];
  /** Taux TVA par défaut spécifique à chaque boutique (code), sinon défaut org. */
  storeTaxDefaults?: Record<string, string>;
  currentUser: { id: string; name: string; role: string };
  posUi: PosUiSettings;
  /** Si false, le bouton "Commande differee (retrait a date)" est masque. */
  deferredOrdersEnabled: boolean;
  /** État initial résolu côté serveur (poste appairé + session ouverte) pour
   *  un 1er rendu sans « Chargement caisse… ». Null si non appairé. */
  initial?: { deviceId: string; storeId: string; registerId: string; sessionId: string | null } | null;
}

type View = { kind: 'categories' } | { kind: 'products'; categoryId: string | 'uncategorized' };

const FREE_PRICE_TAX_CODE_DEFAULT = 'TVA20';

/**
 * Cache catalogue (produits + catégories) par boutique — « stale-while-revalidate ».
 * En mémoire (survit aux navigations SPA) + sessionStorage (survit à un reload).
 * Permet à la caisse de peindre le catalogue INSTANTANÉMENT au retour, pendant
 * qu'une actualisation se fait en fond. On ne montre plus une grille vide le
 * temps du round-trip réseau.
 */
const _catalogMem = new Map<string, { products: PosProduct[]; categories: Category[] }>();
function readCatalogCache(storeId: string): { products: PosProduct[]; categories: Category[] } | null {
  const mem = _catalogMem.get(storeId);
  if (mem) return mem;
  try {
    const raw = sessionStorage.getItem(`webpos_catalog:${storeId}`);
    if (raw) {
      const v = JSON.parse(raw) as { products: PosProduct[]; categories: Category[] };
      _catalogMem.set(storeId, v);
      return v;
    }
  } catch { /* stockage indisponible / quota */ }
  return null;
}
function writeCatalogCache(storeId: string, v: { products: PosProduct[]; categories: Category[] }): void {
  _catalogMem.set(storeId, v);
  try { sessionStorage.setItem(`webpos_catalog:${storeId}`, JSON.stringify(v)); } catch { /* quota */ }
}

/**
 * Résout un article scanné par son code : code principal, SKU, ou l'un des
 * codes-barres supplémentaires (multi-EAN). Insensible à la casse.
 */
function matchProductByCode(products: PosProduct[], code: string): PosProduct | undefined {
  const c = code.trim();
  if (!c) return undefined;
  const up = c.toUpperCase();
  return products.find((p) =>
    p.barcode === c || p.barcode === up ||
    p.sku === c || p.sku === up ||
    (p.extra_barcodes?.some((b) => b === c || b.toUpperCase() === up) ?? false),
  );
}

export default function CashRegister({
  stores, registers, taxRates, storeTaxDefaults, currentUser, posUi, deferredOrdersEnabled, initial,
}: Props) {
  const metrics = useMemo(() => tileMetrics(posUi.tile_size), [posUi.tile_size]);
  // Mode école : quand actif, on ne fait AUCUN appel mutant côté serveur.
  // La caisse a une session fictive auto-ouverte, les lignes restent en
  // local, "encaisser" génère un faux ticket. Toutes les données sont
  // détruites au passage en mode normal.
  const schoolMode = useSchoolMode();

  // Liaison poste (device) <-> caisse : 1 poste = 1 caisse.
  // - deviceId : UUID cote client, stocke en localStorage.
  // - registerId/storeId : non renseignes tant que la caisse n'a pas
  //   ete choisie (premier accès sur ce poste). Un ecran de selection
  //   s'affiche pour que l'utilisateur pique une caisse libre.
  // Seed serveur (poste appairé) : la caisse s'affiche dès le 1er rendu.
  const [deviceId, setDeviceId] = useState<string | null>(initial?.deviceId ?? null);
  const [storeId, setStoreId] = useState<string>(initial?.storeId ?? '');
  const [registerId, setRegisterId] = useState<string>(initial?.registerId ?? '');
  const [pickerNeeded, setPickerNeeded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Identifiant durable (cookie + localStorage) : survit aux
    // redémarrages à froid de la PWA iOS, sinon le poste redemanderait sa
    // caisse à chaque réouverture.
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    const bound = registers.find((r) => r.device_id === id);
    if (bound) {
      setStoreId(bound.store_id);
      setRegisterId(bound.id);
      setPickerNeeded(false);
    } else {
      setStoreId('');
      setRegisterId('');
      setPickerNeeded(true);
    }
  }, [registers]);

  const [sessionId, setSessionId] = useState<string | null>(initial?.sessionId ?? null);
  // Session déjà résolue côté serveur (poste appairé) → pas d'écran de
  // chargement au 1er rendu. La vérification client se fait ensuite en fond.
  const [sessionLoading, setSessionLoading] = useState(!initial);
  const sessionKnownRef = useRef<boolean>(!!initial);
  const [showOpenSession, setShowOpenSession] = useState(false);
  // Accueil première connexion : statut des premières étapes (null = pas encore su).
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ kind: 'categories' });

  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [savingLines, setSavingLines] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<{
    id: string; number: string; saleId: string; customerId: string | null;
    loyalty: { earned: number; redeemed: number; new_balance: number } | null;
    change?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showFreePrice, setShowFreePrice] = useState<{ label?: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [discountLineKey, setDiscountLineKey] = useState<string | null>(null);
  const [justifyAction, setJustifyAction] = useState<
    | { kind: 'remove'; key: string }
    | { kind: 'lineDiscount'; key: string; amount: number }
    | { kind: 'cartDiscount'; amount: number; mode: 'percent' | 'amount' }
    | null
  >(null);
  const [cartComment, setCartComment] = useState('');
  // Panneau « Remise » / « Commentaire » (ex-« Actions »), ou fermé.
  const [cartActions, setCartActions] = useState<'discount' | 'comment' | null>(null);
  // Ouverture tiroir : état d'envoi + éclair de confirmation discret.
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [drawerFlash, setDrawerFlash] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  // Recherche repliée par défaut : ouverte via la loupe (près du panier
  // en attente) ou la touche « / ».
  const [searchOpen, setSearchOpen] = useState(false);
  // Panier glissé en mode mobile : ouvert via le bouton flottant OU via
  // un swipe horizontal (gauche = ouvrir, droite = fermer).
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Détection swipe horizontal sur mobile pour basculer entre catalogue
  // et panier. Seuil : ≥ 60 px horizontaux, vertical < 60 px.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e: React.TouchEvent, intent: 'open' | 'close') {
    const start = swipeRef.current;
    swipeRef.current = null;
    const end = e.changedTouches[0];
    if (!start || !end) return;
    // Un appui sur un bouton/lien du ticket (ex. « Annuler », « Vider ») peut,
    // avec le pouce, dériver de >60 px et être pris pour un swipe de fermeture :
    // le ticket glissait alors hors écran et la popup de confirmation
    // apparaissait par-dessus le catalogue. On ignore donc les gestes qui se
    // terminent sur un contrôle interactif.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dy) > 60) return;
    if (Date.now() - start.t > 600) return;
    if (intent === 'open' && dx < -60) setMobileCartOpen(true);
    else if (intent === 'close' && dx > 60) setMobileCartOpen(false);
  }

  // Largeur du panier ticket (redimensionnable, persistée en localStorage)
  const DEFAULT_TICKET_WIDTH = 360; // 300 * 1.2
  const [ticketWidth, setTicketWidth] = useState<number>(DEFAULT_TICKET_WIDTH);
  const dragging = useRef(false);
  useEffect(() => {
    const stored = Number(localStorage.getItem('webpos_ticket_width') ?? '');
    if (Number.isFinite(stored) && stored >= 280 && stored <= 600) setTicketWidth(stored);
  }, []);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const w = Math.max(280, Math.min(600, window.innerWidth - e.clientX));
      setTicketWidth(w);
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = '';
        localStorage.setItem('webpos_ticket_width', String(ticketWidth));
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [ticketWidth]);
  const [loyalty, setLoyalty] = useState<{
    enabled: boolean;
    balance_euros: number;
    min_redeem: number;
    used: number;
  }>({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });

  // Soldes complémentaires du client (cartes cadeau, compte client, avoirs)
  // affichés dans la zone ticket. Rafraîchis quand un client est attaché.
  const [customerBalances, setCustomerBalances] = useState<{
    gift_card_balance: number;
    account_balance: number;
    credit_notes_balance: number;
  }>({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });

  const searchRef = useRef<HTMLInputElement>(null);

  // Écran & livraison : la valeur reçue du serveur est au niveau organisation
  // (le poste n'est pas encore lié côté serveur). On la réaffine par boutique
  // une fois le storeId connu — chaque boutique active/désactive la commande
  // différée indépendamment.
  const [deferredEnabled, setDeferredEnabled] = useState(deferredOrdersEnabled);

  // Charge produits + catégories + réglage écran/livraison (re-fetch a chaque
  // changement de boutique — la portee par boutique peut varier).
  useEffect(() => {
    if (!storeId) return;
    // Peinture instantanée depuis le cache (stale-while-revalidate) : le
    // catalogue précédent s'affiche tout de suite pendant l'actualisation.
    const cached = readCatalogCache(storeId);
    if (cached) {
      if (cached.products.length) setProducts(cached.products);
      if (cached.categories.length) setCategories(cached.categories);
    }
    void (async () => {
      const [pRes, cRes, sdRes] = await Promise.all([
        fetch(`/api/products?pos=1&store_id=${encodeURIComponent(storeId)}`),
        fetch(`/api/categories?pos=1&store_id=${encodeURIComponent(storeId)}`),
        fetch(`/api/settings/screen-delivery?store_id=${encodeURIComponent(storeId)}`),
      ]);
      let freshProducts: PosProduct[] | null = null;
      let freshCategories: Category[] | null = null;
      if (pRes.ok) {
        const j = await pRes.json();
        freshProducts = j.products.map((p: Record<string, unknown>) => ({
          ...p,
          sale_price_ttc: Number(p.sale_price_ttc),
          tax_rate: Number(p.tax_rate),
          discount_value: p.discount_value != null ? Number(p.discount_value) : null,
        })) as PosProduct[];
        setProducts(freshProducts);
      }
      if (cRes.ok) {
        freshCategories = (await cRes.json()).categories as Category[];
        setCategories(freshCategories);
      }
      if (sdRes.ok) setDeferredEnabled(Boolean((await sdRes.json()).settings?.enabled));
      // Met le cache à jour avec les données fraîches.
      if (freshProducts && freshCategories) {
        writeCatalogCache(storeId, { products: freshProducts, categories: freshCategories });
      }
    })();
  }, [storeId]);

  // Vérifie session caisse
  const refreshSession = useCallback(async () => {
    if (!registerId) return;
    // On n'affiche « Chargement caisse… » QUE si l'état session est encore
    // inconnu. Si le serveur l'a déjà fourni (poste appairé) ou qu'on l'a déjà
    // chargé, on rafraîchit EN FOND, sans écran de chargement (évite le flash
    // et le blocage de peinture iOS PWA).
    if (!sessionKnownRef.current) setSessionLoading(true);
    // Mode école : on simule une session ouverte sans appeler le serveur.
    if (schoolMode) {
      setSessionId('school-session');
      sessionKnownRef.current = true;
      setSessionLoading(false);
      return;
    }
    const res = await fetch(`/api/cash-sessions?register_id=${registerId}`);
    if (res.ok) {
      const j = await res.json();
      setSessionId(j.session?.id ?? null);
    }
    sessionKnownRef.current = true;
    setSessionLoading(false);
  }, [registerId, schoolMode]);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

  // Re-vérifie la session au retour sur l'onglet / réveil de la tablette :
  // détecte une clôture faite entre-temps depuis un autre poste ou le BO
  // (sinon la caisse gardait l'ancienne session en mémoire et ne demandait
  // jamais la réouverture).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void refreshSession();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshSession]);

  // Statut d'accueil : chargé uniquement quand il n'y a pas de session (nouvelle
  // caisse ou journée fermée). En cas d'échec ou hors première fois, on retombe
  // sur le comportement normal (ouverture directe de la modale fond de caisse).
  useEffect(() => {
    if (schoolMode) { setOnboarding({ has_category: true, has_product: true, has_customer: true, has_sale: true, first_time: false }); return; }
    if (sessionLoading || sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/onboarding/status');
        const s: OnboardingStatus = r.ok
          ? await r.json()
          : { has_category: false, has_product: false, has_customer: false, has_sale: false, first_time: false };
        if (!cancelled) setOnboarding(s);
      } catch {
        if (!cancelled) setOnboarding({ has_category: false, has_product: false, has_customer: false, has_sale: false, first_time: false });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionLoading, sessionId, schoolMode]);

  // Arrivée sans session ouverte : on déclenche automatiquement la modale
  // "Ouvrir la caisse". Réarmé dès qu'une session redevient active, pour
  // se redéclencher après une clôture de journée. Exception : à la toute
  // première connexion (aucune vente), on affiche d'abord l'écran d'accueil.
  const autoPromptOnceRef = useRef(false);
  useEffect(() => {
    if (sessionLoading) return;
    if (sessionId) { autoPromptOnceRef.current = false; return; }
    if (onboarding === null) return;      // on attend le statut d'accueil
    if (onboarding.first_time) return;    // accueil affiché à la place
    if (autoPromptOnceRef.current) return;
    autoPromptOnceRef.current = true;
    setShowOpenSession(true);
  }, [sessionLoading, sessionId, onboarding]);

  const refreshHeldCount = useCallback(async () => {
    if (!storeId) return;
    // Tickets en attente partagés par toute la boutique (pas par caisse).
    const r = await fetch(`/api/sales/held?store_id=${encodeURIComponent(storeId)}`);
    if (r.ok) {
      const j = await r.json();
      setHeldCount((j.held ?? []).length);
    }
  }, [storeId]);
  useEffect(() => { void refreshHeldCount(); }, [refreshHeldCount, showHeld]);

  // Persiste lignes côté serveur (debounced)
  useEffect(() => {
    if (!saleId) return;
    const t = setTimeout(() => { void syncLines(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, saleId]);

  // Persistance de la vente en cours sur le poste (scopée au register actif) :
  // si l'utilisateur quitte la caisse — typiquement en ouvrant la fiche d'un
  // client — puis revient, on retrouve le panier et le client.
  const cartKey = registerId ? `webpos_active_sale:${registerId}` : null;
  const restoredOnceRef = useRef(false);
  // Empêche l'effet de persistance d'écrire/supprimer la clé AVANT qu'on ait
  // tenté de restaurer. Sans ce garde, au remount saleId=null supprimerait la
  // vente mémorisée avant même que l'effet de restauration ait pu la lire.
  const restoreAttemptedRef = useRef(false);
  // Empêche d'ajouter deux fois l'article carte cadeau / bon d'achat en attente.
  const pendingItemHandled = useRef(false);
  // Passe à true quand la tentative de restauration d'un panier draft est
  // terminée : on n'injecte l'article en attente qu'APRÈS, pour qu'il ne soit
  // pas écrasé par le rechargement des lignes.
  const [restoreDone, setRestoreDone] = useState(false);

  // Restauration EN PREMIER (déclarée avant l'effet de persistance pour
  // s'exécuter avant lui) : au (re)mount, si un saleId est mémorisé pour ce
  // register et pointe encore sur une vente draft/on_hold, on recharge lignes
  // + client (+ fidélité / soldes via restoreCustomerForSale).
  useEffect(() => {
    if (!cartKey || restoredOnceRef.current) return;
    if (typeof window === 'undefined') return;
    restoredOnceRef.current = true;
    const stored = localStorage.getItem(cartKey);
    if (!stored) { restoreAttemptedRef.current = true; setRestoreDone(true); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/sales/${stored}`);
        if (!r.ok) { localStorage.removeItem(cartKey); return; }
        const j = await r.json();
        if (j.sale?.status !== 'draft' && j.sale?.status !== 'on_hold') {
          localStorage.removeItem(cartKey);
          return;
        }
        setSaleId(stored);
        setLines((j.lines as Record<string, unknown>[]).map((l) => ({
          key: cryptoKey(),
          product_id: (l.product_id as string) ?? null,
          variant_id: (l.variant_id as string) ?? null,
          label: l.label as string,
          unit_price_ttc: Number(l.unit_price_ttc),
          quantity: Number(l.quantity),
          discount_amount: Number(l.discount_amount),
          tax_rate: Number(l.tax_rate),
          tax_rate_code: l.tax_rate_code as string,
          metadata: (l.metadata as Record<string, unknown>) ?? {},
        })));
        await restoreCustomerForSale(j.sale.customer_id ?? null);
      } finally {
        // On n'autorise la persistance qu'après cette tentative.
        restoreAttemptedRef.current = true;
        setRestoreDone(true);
      }
    })();
  }, [cartKey]);

  useEffect(() => {
    if (!cartKey || typeof window === 'undefined') return;
    if (!restoreAttemptedRef.current) return;
    // Un panier de démonstration ne se mémorise pas comme un vrai : son
    // identifiant ne mène nulle part côté serveur.
    if (saleId && !schoolMode) localStorage.setItem(cartKey, saleId);
    else localStorage.removeItem(cartKey);
  }, [cartKey, saleId, schoolMode]);

  const ensureSale = useCallback(async (): Promise<string | null> => {
    if (saleId) return saleId;
    if (!sessionId) { setError('Aucune session caisse ouverte.'); return null; }
    // Mode école : on génère un faux saleId, pas d'appel serveur
    if (schoolMode) {
      const fake = `school-${cryptoKey()}`;
      setSaleId(fake);
      return fake;
    }
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, register_id: registerId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.error === 'NO_OPEN_CASH_SESSION') {
        // La journée a été clôturée (potentiellement depuis un autre poste) :
        // on invalide la session mémorisée et on invite à rouvrir la caisse.
        setSessionId(null);
        setShowOpenSession(true);
        setError('Journée clôturée : rouvrez la caisse pour encaisser.');
      } else {
        setError(j.error ?? 'Création vente impossible');
      }
      return null;
    }
    const { id } = await res.json();
    setSaleId(id);
    return id;
  }, [saleId, sessionId, storeId, registerId, schoolMode]);

  async function syncLines() {
    if (!saleId) return;
    if (schoolMode) return; // pas de persistance en mode école
    setSavingLines(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${saleId}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id,
            label: l.label,
            unit_price_ttc: l.unit_price_ttc,
            quantity: l.quantity,
            discount_amount: l.discount_amount,
            tax_rate: l.tax_rate,
            tax_rate_code: l.tax_rate_code,
            metadata: l.metadata,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Sync : ${j.error ?? 'erreur'}`);
      }
    } finally { setSavingLines(false); }
  }

  // Persiste le commentaire du ticket (sales.notes) : il figure ainsi sur le
  // ticket imprimé et sur la facture, pas seulement à l'écran.
  async function persistComment(text: string) {
    if (schoolMode) return;
    const id = saleId ?? await ensureSale();
    if (!id) return;
    try {
      await fetch(`/api/sales/${id}/comment`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text || null }),
      });
    } catch { /* réseau coupé : le commentaire reste au moins affiché en caisse */ }
  }

  // Top produits épinglés (max 4) affichés sur la première ligne de la grille catégories
  const topProducts = useMemo(
    () => products.filter((p) => p.is_top_product).slice(0, 4),
    [products],
  );

  // Catégories effectivement présentes (au moins 1 produit) + bucket "sans catégorie"
  const categoriesWithCounts = useMemo(() => {
    // Catégories visibles sur cette caisse (déjà filtrées par boutique côté
    // serveur). Un article dont la catégorie n'y figure pas (ex. catégorie
    // « toutes boutiques » non rattachée à ce poste) bascule en « sans
    // catégorie » pour rester accessible.
    const catIds = new Set(categories.map((c) => c.id));
    const counts = new Map<string, number>();
    for (const p of products) {
      const k = p.category_id && catIds.has(p.category_id) ? p.category_id : 'uncategorized';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const cats = categories
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      // Masque de l'accueil caisse : au moins 1 produit ET catégorie visible
      // (décocher « Visible sur la caisse » la retire, même si elle contient
      // un article en top).
      .filter((c) => c.count > 0 && c.visible_in_pos !== false);
    const uncat = counts.get('uncategorized') ?? 0;
    return { cats, uncategorized: uncat };
  }, [products, categories]);

  // Liste des produits affichés (en mode recherche OU dans une catégorie).
  // On filtre sur une valeur DIFFÉRÉE de la recherche : la frappe reste
  // fluide même avec plusieurs centaines de produits (le recalcul de la
  // grille ne bloque plus chaque touche).
  const deferredSearch = useDeferredValue(search);
  const searchQ = deferredSearch.trim().toLowerCase();
  const visibleProducts = useMemo(() => {
    if (searchQ) {
      // Recherche « contient » sur nom, SKU et code-barres : les 3 premières
      // lettres filtrent, chaque lettre supplémentaire affine. Le code-barres
      // est cherché en « contient » : taper les 5 derniers chiffres de l'EAN
      // suffit à retrouver l'article (pas besoin du code complet).
      return products.filter((p) =>
        p.name.toLowerCase().includes(searchQ) ||
        p.sku?.toLowerCase().includes(searchQ) ||
        (p.barcode ? p.barcode.toLowerCase().includes(searchQ) : false) ||
        (p.extra_barcodes?.some((b) => b.toLowerCase().includes(searchQ)) ?? false)
      );
    }
    if (view.kind === 'products') {
      const catIds = new Set(categories.map((c) => c.id));
      return products.filter((p) =>
        view.categoryId === 'uncategorized'
          // « Sans catégorie » inclut aussi les articles dont la catégorie
          // n'est pas visible sur cette caisse (sinon ils seraient orphelins).
          ? p.category_id == null || !catIds.has(p.category_id)
          : p.category_id === view.categoryId,
      );
    }
    return [];
  }, [products, searchQ, view, categories]);

  // Totaux locaux
  const totals = useMemo(() => {
    let ttc = 0, ht = 0, tva = 0, discount = 0;
    const byRate = new Map<number, { base_ht: number; tva: number; ttc: number }>();
    for (const l of lines) {
      const rawTtc = l.unit_price_ttc * l.quantity - l.discount_amount;
      const lineTtc = Math.max(0, round2(rawTtc));
      const lineHt = round2(lineTtc / (1 + l.tax_rate / 100));
      const lineTva = round2(lineTtc - lineHt);
      ttc = round2(ttc + lineTtc); ht = round2(ht + lineHt); tva = round2(tva + lineTva);
      discount = round2(discount + l.discount_amount);
      const b = byRate.get(l.tax_rate) ?? { base_ht: 0, tva: 0, ttc: 0 };
      b.base_ht = round2(b.base_ht + lineHt);
      b.tva = round2(b.tva + lineTva);
      b.ttc = round2(b.ttc + lineTtc);
      byRate.set(l.tax_rate, b);
    }
    return { ttc, ht, tva, discount, breakdown: Array.from(byRate.entries()).sort((a,b)=>b[0]-a[0]) };
  }, [lines]);

  // Vente d'un PACK : on l'éclate en lignes composant (chacune avec son prix et
  // sa TVA). La remise du pack est répartie au prorata sur les composants — la
  // somme des lignes vaut donc le prix du pack. Chaque composant portant son
  // product_id, la décrémentation de stock à la validation le prend en charge.
  const addPack = useCallback(async (pack: PosProduct) => {
    void ensureSale();
    try {
      const r = await fetch(`/api/products/packs/${pack.id}`);
      if (!r.ok) { setError('Pack indisponible.'); return; }
      const { pack: data } = await r.json();
      const comps: Array<{ product_id: string; quantity: number; name: string; sale_price_ttc: number }> = data.items ?? [];
      if (comps.length === 0) { setError('Pack vide.'); return; }
      const weights = comps.map((c) => round2(c.sale_price_ttc * c.quantity));
      const discount = Math.max(0, Number(data.pack_discount_ttc) || 0);
      const parts = distributeProrata(round2(discount), weights);
      const catalog = productsRef.current;
      const newLines: CartLine[] = comps.map((c, i) => {
        const cp = catalog.find((x) => x.id === c.product_id);
        return {
          key: cryptoKey(),
          product_id: c.product_id, variant_id: null,
          label: c.name,
          unit_price_ttc: c.sale_price_ttc,
          quantity: c.quantity,
          discount_amount: parts[i] ?? 0,
          tax_rate: cp?.tax_rate ?? pack.tax_rate,
          tax_rate_code: cp?.tax_rate_code ?? pack.tax_rate_code,
          metadata: { pack_id: pack.id, pack_label: pack.name },
        };
      });
      setLines((cur) => [...cur, ...newLines]);
    } catch {
      setError('Pack indisponible (réseau).');
    }
  }, [ensureSale]);

  const addProduct = useCallback((p: PosProduct) => {
    if (p.is_pack) { void addPack(p); return; }
    void ensureSale();
    if (p.price_is_free) { setShowFreePrice({ label: p.name }); return; }
    // Remise systématique du client : appliquée automatiquement à chaque ajout
    // SAUF si le produit est marqué "prix fort" (no_discount = true) — typiquement
    // les cartes cadeaux, qui sont toujours vendues au prix affiché.
    const autoPct = p.no_discount ? 0 : (customer?.default_discount_pct ?? 0);
    // Remise propre à l'article (fiche produit) : réduction par unité, appliquée
    // au scan/à l'ajout (comme sur l'étiquette). Cumulable avec la remise client.
    let prodDiscUnit = 0;
    if (p.discount_type && p.discount_value && p.discount_value > 0) {
      const reduced = p.discount_type === 'percent'
        ? p.sale_price_ttc * (1 - p.discount_value / 100)
        : p.sale_price_ttc - p.discount_value;
      prodDiscUnit = round2(Math.max(0, p.sale_price_ttc - Math.max(0, reduced)));
    }
    const lineDiscount = (qty: number) =>
      round2(round2((p.sale_price_ttc * qty * autoPct) / 100) + round2(prodDiscUnit * qty));
    setLines((cur) => {
      const existing = cur.find(
        (l) => l.product_id === p.id
            && l.unit_price_ttc === p.sale_price_ttc
            && !l.metadata?.cart_discount
            && (l.metadata?.auto_discount_pct ?? 0) === autoPct
            && (l.metadata?.product_disc_unit ?? 0) === prodDiscUnit,
      );
      if (existing) {
        return cur.map((l) => (l === existing
          ? { ...l, quantity: l.quantity + 1, discount_amount: lineDiscount(l.quantity + 1) }
          : l));
      }
      return [...cur, {
        key: cryptoKey(),
        product_id: p.id, variant_id: null,
        label: p.name, unit_price_ttc: p.sale_price_ttc,
        quantity: 1, discount_amount: lineDiscount(1),
        tax_rate: p.tax_rate, tax_rate_code: p.tax_rate_code,
        metadata: {
          ...(autoPct > 0 ? { auto_discount_pct: autoPct } : {}),
          ...(prodDiscUnit > 0 ? { product_disc_unit: prodDiscUnit } : {}),
        },
      }];
    });
  }, [ensureSale, customer, addPack]);

  // Référence stable vers addProduct : passée aux tuiles (mémoïsées) comme
  // onPick. Sans ça, l'identité de addProduct change à chaque vente (saleId /
  // client) et force le re-rendu de TOUTE la grille produits.
  const addProductRef = useRef(addProduct);
  addProductRef.current = addProduct;
  const onPickProductStable = useCallback((p: PosProduct) => addProductRef.current(p), []);

  // Précharge le chunk de l'écran de paiement dès qu'il y a un article au
  // panier : au moment d'appuyer sur « Paiement », le module est déjà chargé
  // (pas de délai de chargement du bundle).
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (hasLines) void import('./PaymentModal').catch(() => {});
  }, [hasLines]);

  function useLoyalty(amountEuros: number) {
    if (!customer || amountEuros <= 0) return;
    const subtotal = lines.reduce((s, l) => s + round2(l.unit_price_ttc * l.quantity - l.discount_amount), 0);
    const apply = Math.min(round2(amountEuros), round2(subtotal));
    if (apply <= 0) return;
    // Réparti proportionnellement sur les lignes (pour conserver la TVA), au
    // centime près : la somme des parts vaut exactement `apply` (plus fort reste).
    setLines((cur) => {
      const weights = cur.map((l) => round2(l.unit_price_ttc * l.quantity - l.discount_amount));
      const parts = distributeProrata(apply, weights);
      return cur.map((l, i) => ({ ...l, discount_amount: round2(l.discount_amount + (parts[i] ?? 0)) }));
    });
    setLoyalty((cur) => ({ ...cur, used: apply, balance_euros: cur.balance_euros - apply }));
  }

  function removeLoyalty() {
    if (!loyalty.used) return;
    // Restaure le solde et recalcule : pour simplicité, on relit le solde côté serveur au prochain client switch
    setLoyalty((cur) => ({ ...cur, balance_euros: cur.balance_euros + cur.used, used: 0 }));
    // On enlève la part proportionnelle qu'on avait ajoutée — version naïve : on remet
    // discount_amount à sa valeur initiale en relisant depuis la BDD via syncLines.
    // Plus simple : on demande à l'utilisateur de re-saisir si besoin via le picker.
    void syncLines();
  }

  function addFreeBouquet(amount: number, taxCode: string, label: string) {
    const tax = taxRates.find((t) => t.code === taxCode) ?? taxRates[0]!;
    // Remise systématique du client appliquée AUSSI aux articles à prix libre
    // (bouquets, gerbes…), comme pour les produits catalogue.
    const autoPct = customer?.default_discount_pct ?? 0;
    const discount = autoPct > 0 ? round2((amount * autoPct) / 100) : 0;
    setLines((cur) => [...cur, {
      key: cryptoKey(),
      product_id: null, variant_id: null,
      label, unit_price_ttc: amount, quantity: 1, discount_amount: discount,
      tax_rate: tax.rate, tax_rate_code: tax.code,
      metadata: autoPct > 0 ? { freeform: true, auto_discount_pct: autoPct } : { freeform: true },
    }]);
    setShowFreePrice(null);
    void ensureSale();
  }

  // Article « en attente » déposé par la page « Avoirs & Cartes cadeaux »
  // (boutons « Nouvelle carte cadeau » / « Nouveau bon d'achat », qui saisissent
  // le montant puis redirigent ici). Au montage — dès qu'une caisse est ouverte
  // (panier disponible) — on ajoute la ligne au panier pour encaissement
  // classique, puis on purge la clé. Une seule fois par arrivée.
  useEffect(() => {
    if (pendingItemHandled.current) return;
    if (!sessionId || !restoreDone) return;
    let pending: { kind?: string; amount?: number; paid?: number } | null = null;
    try {
      const raw = localStorage.getItem('webpos_pending_cart_item');
      if (raw) pending = JSON.parse(raw);
    } catch { pending = null; }
    if (!pending) return;
    pendingItemHandled.current = true;
    try { localStorage.removeItem('webpos_pending_cart_item'); } catch { /* ignore */ }
    const amount = round2(Number(pending.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (pending.kind === 'voucher') {
      const paidParsed = round2(Number(pending.paid ?? amount));
      const paid = Number.isFinite(paidParsed) ? Math.max(0, Math.min(amount, paidParsed)) : amount;
      setLines((cur) => [...cur, {
        key: cryptoKey(), product_id: null, variant_id: null,
        label: 'Bon d\'achat', unit_price_ttc: amount, quantity: 1,
        discount_amount: round2(amount - paid),
        tax_rate: 0, tax_rate_code: 'CADEAU', metadata: { gift_card: true, kind: 'voucher' },
      }]);
    } else {
      setLines((cur) => [...cur, {
        key: cryptoKey(), product_id: null, variant_id: null,
        label: 'Carte cadeau', unit_price_ttc: amount, quantity: 1, discount_amount: 0,
        tax_rate: 0, tax_rate_code: 'CADEAU', metadata: { gift_card: true },
      }]);
    }
    void ensureSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, restoreDone]);

  function incLine(key: string, delta: number) {
    setLines((cur) => cur
      .map((l) => l.key === key ? { ...l, quantity: round2(l.quantity + delta) } : l)
      .filter((l) => l.quantity > 0));
  }
  function removeLine(key: string) { setLines((cur) => cur.filter((l) => l.key !== key)); }
  // Demande de justification pour suppression (cartes / contrôle de gestion)
  function requestRemoveLine(key: string) {
    setJustifyAction({ kind: 'remove', key });
  }
  function setLineDiscount(key: string, amount: number) {
    setLines((cur) => cur.map((l) => l.key === key ? { ...l, discount_amount: Math.max(0, amount) } : l));
  }

  /** Tente d'ajouter un produit à partir d'un code-barres ou SKU scanné. */
  function addByCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const match = matchProductByCode(products, code);
    if (match) {
      addProduct(match);
      setShowScanner(false);
    } else {
      // Code inconnu : laisse la modale ouverte mais affiche dans la barre de recherche
      setSearch(code);
    }
  }

  async function cancelTicket() {
    // Suppression directe (sans justification) du panier en cours.
    // - Si une vente brouillon existe côté serveur, on la supprime via /api/sales/[id]/cancel
    //   pour qu'elle n'apparaisse plus dans les paniers en attente.
    // - Reset complet du state local.
    if (saleId && !schoolMode) {
      await fetch(`/api/sales/${saleId}/cancel`, { method: 'POST' }).catch(() => undefined);
    }
    setLines([]);
    setSaleId(null);
    setCustomer(null);
    setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
    setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
    setCartComment('');
    setView({ kind: 'categories' });
    setSearch('');
    void refreshHeldCount();
  }

  // Ouverture manuelle du tiroir-caisse (sans vente). Le tiroir physique est
  // piloté par l'imprimante ticket (drawer kick) ; on trace l'ouverture côté
  // serveur (audit / Z). Bouton volontairement discret (voir en-tête ticket).
  async function openDrawer() {
    if (drawerBusy) return;
    setDrawerBusy(true);
    try {
      await fetch('/api/cash-sessions/open-drawer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_id: registerId || undefined, store_id: storeId || undefined, reason: 'no_sale' }),
      });
      setDrawerFlash(true);
      setTimeout(() => setDrawerFlash(false), 1400);
    } catch {
      /* silencieux : ne rien révéler à l'écran */
    } finally {
      setDrawerBusy(false);
    }
  }

  async function holdSale() {
    if (!saleId) return;
    // Libellé auto-généré : pas de modale, pas de prompt
    const autoLabel = customer?.display_name
      ? `${customer.display_name} · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : `Panier ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const res = await fetch(`/api/sales/${saleId}/hold`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: autoLabel }),
    });
    if (res.ok) {
      // Incrémente immédiatement le compteur « En attente » sans attendre un
      // rechargement de la caisse.
      setHeldCount((n) => n + 1);
      setSaleId(null); setLines([]); setCustomer(null);
      setView({ kind: 'categories' }); setSearch('');
    }
  }

  /**
   * Recharge le client attaché à une vente (et son solde fidélité +
   * balances cartes cadeau / avoir / compte). Utilisé au mount-restore
   * et au recall d'une vente en attente, pour ne pas perdre les infos
   * client lors d'un changement de device.
   */
  async function restoreCustomerForSale(customerId: string | null) {
    if (!customerId) {
      setCustomer(null);
      setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
      setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
      return;
    }
    try {
      const cr = await fetch(`/api/customers/${customerId}`);
      if (cr.ok) {
        const cj = await cr.json();
        const cu = cj.customer;
        if (cu) {
          setCustomer({
            id: cu.id,
            display_name: cu.company_name
              || [cu.first_name, cu.last_name].filter(Boolean).join(' ')
              || 'Client',
            type: cu.type ?? 'particulier',
            email: cu.email ?? null,
            phone: cu.phone ?? null,
            company_name: cu.company_name ?? null,
            default_discount_pct: Number(cu.default_discount_pct ?? 0),
          });
        }
      }
    } catch { /* ignore */ }
    // Périmètre fidélité : on transmet la boutique du poste pour obtenir le
    // solde du bon groupe (fidélité segmentée possible en Croissance+).
    // Fidélité + soldes chargés EN PARALLÈLE (indépendants).
    const storeQ = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    const [lj, bj] = await Promise.all([
      fetch(`/api/customers/${customerId}/loyalty${storeQ}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/customers/${customerId}/balances${storeQ}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (lj?.loyalty?.enabled) {
      setLoyalty({
        enabled: true,
        balance_euros: Number(lj.balance_euros) || 0,
        min_redeem: Number(lj.loyalty.min_redeem) || 0,
        used: 0,
      });
    }
    if (bj) {
      setCustomerBalances({
        gift_card_balance: Number(bj.gift_card_balance) || 0,
        account_balance: Number(bj.account_balance) || 0,
        credit_notes_balance: Number(bj.credit_notes_balance) || 0,
      });
    }
  }

  async function recallSale(id: string) {
    // Reprise sur la caisse COURANTE : réaffecte la vente à ce poste + sa
    // session (tiroir), même si le ticket a été démarré sur une autre caisse
    // de la boutique. Refusé si la vente vient d'une autre boutique.
    if (registerId) {
      const rs = await fetch(`/api/sales/${id}/resume`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register_id: registerId }),
      });
      if (!rs.ok) {
        const j = await rs.json().catch(() => ({}));
        setError(j.error === 'CROSS_STORE_FORBIDDEN'
          ? 'Ce ticket appartient à une autre boutique.'
          : (j.error ?? 'Reprise impossible'));
        return;
      }
    }
    const res = await fetch(`/api/sales/${id}`);
    if (!res.ok) return;
    const j = await res.json();
    setSaleId(id);
    setLines((j.lines as Record<string, unknown>[]).map((l) => ({
      key: cryptoKey(),
      product_id: (l.product_id as string) ?? null,
      variant_id: (l.variant_id as string) ?? null,
      label: l.label as string,
      unit_price_ttc: Number(l.unit_price_ttc),
      quantity: Number(l.quantity),
      discount_amount: Number(l.discount_amount),
      tax_rate: Number(l.tax_rate),
      tax_rate_code: l.tax_rate_code as string,
      metadata: (l.metadata as Record<string, unknown>) ?? {},
    })));
    // Restaure le commentaire du ticket (sales.notes).
    setCartComment((j.sale?.notes as string) ?? '');
    // Restaure le client attaché (sinon perdu lors d'un recall cross-device).
    await restoreCustomerForSale(j.sale?.customer_id ?? null);
    setShowHeld(false);
  }

  /**
   * Encaissement direct sans modale de règlement : on alloue 100 % du
   * montant TTC à une seule méthode (espèces ou carte). Utilisé par les
   * boutons rapides "Espèces" / "Carte" sur le ticket. Pour tout autre
   * cas (paiement multiple, lien Stripe, remise fidélité…), l'utilisateur
   * clique sur "Autres" qui rouvre PaymentModal.
   */
  /**
   * Encaissement HORS-LIGNE : enregistre la vente complète en local
   * (IndexedDB), remet un ticket provisoire, et laisse la synchro rejouer
   * vers le serveur (qui scellera) à la reprise réseau. Idempotent.
   */
  async function finalizeOffline(
    payments: Array<{ method: 'cash'|'card'|'check'|'transfer'|'gift_card'|'credit_note'|'deferred'|'other'; amount: number; given_amount?: number; reference?: string }>,
    loyaltyUsed: number,
  ) {
    const clientRef = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `off-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const occurredAt = new Date().toISOString();
    await enqueueSale({
      client_ref: clientRef,
      occurred_at: occurredAt,
      store_id: storeId,
      register_id: registerId,
      customer_id: customer?.id ?? null,
      lines: lines.map((l) => ({
        product_id: l.product_id, variant_id: l.variant_id, label: l.label,
        unit_price_ttc: l.unit_price_ttc, quantity: l.quantity,
        discount_amount: l.discount_amount, tax_rate: l.tax_rate,
        tax_rate_code: l.tax_rate_code, metadata: l.metadata,
      })),
      payments,
      loyalty_redemption_amount: loyaltyUsed > 0 ? loyaltyUsed : undefined,
      total_ttc: totals.ttc,
      created_at: Date.now(),
    });
    // Ticket provisoire (scellé à la reprise réseau).
    const provisional = `HORS-LIGNE-${occurredAt.slice(11, 19).replace(/:/g, '')}`;
    await onValidated(`offline-${clientRef}`, provisional, null);
  }

  /** True si on doit basculer en encaissement hors-ligne. */
  function shouldGoOffline(): boolean {
    return offlinePosEnabled() && typeof navigator !== 'undefined' && !navigator.onLine;
  }

  /**
   * Validation d'une vente à 0 € (entièrement remisée / offerte). Aucun
   * règlement n'est nécessaire : on scelle directement avec un tableau de
   * paiements vide.
   */
  async function validateZeroSale() {
    if (lines.length === 0 || totals.ttc !== 0) return;
    setError(null);
    if (shouldGoOffline()) { await finalizeOffline([], loyalty.used); return; }
    const id = await ensureSale();
    if (!id) return;
    await syncLines();
    if (schoolMode) {
      const fakeId = `school-receipt-${Date.now()}`;
      const fakeNumber = `ECOLE-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
      await onValidated(fakeId, fakeNumber, null);
      return;
    }
    try {
      const r = await fetch(`/api/sales/${id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: [],
          loyalty_redemption_amount: loyalty.used > 0 ? loyalty.used : undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? j.message ?? 'Erreur d\'encaissement');
        return;
      }
      const j = await r.json();
      await onValidated(j.receipt_id, j.receipt_number, j.loyalty, j.gift_cards_issued);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onValidated(
    receiptId: string,
    receiptNumber: string,
    loyaltyInfo?: { earned: number; redeemed: number; new_balance: number } | null,
    giftCardsIssued?: Array<{ id: string; code: string; amount: number }>,
    change?: number,
  ) {
    setReceipt({
      id: receiptId, number: receiptNumber,
      saleId: saleId ?? '',
      customerId: customer?.id ?? null,
      loyalty: loyaltyInfo ?? null,
      change: change && change > 0 ? change : undefined,
    });
    // Carte(s) cadeau vendue(s) : on ouvre le PDF imprimable (code-barres) pour
    // remise au client. Déclenché par l'action d'encaissement (pas bloqué par
    // les popups). Chaque carte ouvre son PDF.
    if (giftCardsIssued?.length) {
      for (const gc of giftCardsIssued) {
        try { window.open(`/api/gift-cards/${gc.id}/pdf`, '_blank'); } catch { /* ignore */ }
      }
    }
    setShowPayment(false);
    setSaleId(null); setLines([]); setCustomer(null);
    setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
    setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
    setCartComment('');
    setMobileCartOpen(false);
    // Retour à la vue catégories
    setView({ kind: 'categories' });
    setSearch('');
    // NB : l'événement 'webpos:sale_validated' est dispatché APRÈS la
    // fermeture de la modale de ticket (cf. <ReceiptPreviewModal onClose>),
    // de sorte que l'auto-logout 'after_sale' n'interrompt pas la
    // visualisation / impression / envoi du ticket.
  }

  async function pickCustomer(c: PickedCustomer) {
    const id = await ensureSale();
    if (!id) return;
    // Mode école : la vente n'existe que dans ce navigateur, le serveur ne
    // connaît pas son identifiant — il n'y a rien à y rattacher. Le client est
    // attaché à l'écran, avec sa remise et ses soldes : de quoi dérouler une
    // vente de bout en bout, règlement « en compte » compris.
    if (!schoolMode) {
      const res = await fetch(`/api/sales/${id}/customer`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: c.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Impossible d\'attacher le client');
        return;
      }
    }
    setCustomer(c);
    setShowPicker(false);

    // Remise systématique : applique sur toutes les lignes existantes
    // qui n'ont pas déjà une remise manuelle plus avantageuse.
    // Les lignes "no_discount" (cartes cadeaux) sont exclues.
    if (c.default_discount_pct && c.default_discount_pct > 0) {
      const pct = c.default_discount_pct;
      setLines((cur) => cur.map((l) => {
        const prod = l.product_id ? products.find((pp) => pp.id === l.product_id) : null;
        if (prod?.no_discount) return l;
        const autoDiscount = round2((l.unit_price_ttc * l.quantity * pct) / 100);
        return l.discount_amount >= autoDiscount
          ? l
          : { ...l, discount_amount: autoDiscount, metadata: { ...l.metadata, auto_discount_pct: pct } };
      }));
    }

    // Une fiche inventée pour la démonstration n'a ni fidélité ni solde à
    // aller chercher : elle n'existe que dans ce navigateur.
    if (isSchoolCustomerId(c.id)) {
      setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
      setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
      return;
    }

    // Fidélité + soldes complémentaires : chargés EN PARALLÈLE (indépendants) et
    // sans bloquer — le client est déjà attaché, les pastilles s'affichent dès
    // que les données arrivent.
    void Promise.all([
      fetch(`/api/customers/${c.id}/loyalty`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/customers/${c.id}/balances`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([lj, bj]) => {
      if (lj?.loyalty?.enabled) {
        setLoyalty({
          enabled: true,
          balance_euros: Number(lj.balance_euros) || 0,
          min_redeem: Number(lj.loyalty.min_redeem) || 0,
          used: 0,
        });
      } else {
        setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
      }
      if (bj) {
        setCustomerBalances({
          gift_card_balance: Number(bj.gift_card_balance) || 0,
          account_balance: Number(bj.account_balance) || 0,
          credit_notes_balance: Number(bj.credit_notes_balance) || 0,
        });
      }
    });
  }

  async function detachCustomer() {
    // Pas de vente côté serveur (panier neuf, ou mode école) : le détachement
    // se joue entièrement à l'écran.
    if (!saleId || schoolMode) { setCustomer(null); setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
    setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
    setLines((cur) => cur.filter((l) => l.metadata?.loyalty_redemption !== true)); return; }
    const res = await fetch(`/api/sales/${saleId}/customer`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: null }),
    });
    if (res.ok) {
      setCustomer(null);
      setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
    setCustomerBalances({ gift_card_balance: 0, account_balance: 0, credit_notes_balance: 0 });
      // Retire la ligne fidélité éventuellement déjà appliquée
      setLines((cur) => cur.filter((l) => l.metadata?.loyalty_redemption !== true));
    }
  }

  /**
   * Resout un serial de carte fidelite scanne (Apple Wallet ou autre)
   * vers un client, puis l'attache au panier. Utilise depuis le
   * scanner global — permet de scanner la carte de n'importe ou sur
   * la caisse, meme sans avoir ouvert le picker client.
   *
   * IMPORTANT : PAS de useCallback ici. On veut la fonction refresh a
   * chaque render pour capturer les valeurs a jour de sessionId,
   * pickCustomer, ensureSale — sinon on tombe sur un "Aucune session
   * caisse ouverte" alors qu'elle est bien ouverte (stale closure).
   */
  async function attachCustomerBySerial(serial: string) {
    setError(null);
    try {
      const lookup = await fetch(`/api/wallet/lookup?serial=${encodeURIComponent(serial)}`);
      if (!lookup.ok) {
        // Ne pas échouer en silence : afficher un message clair au lieu de
        // « rien ne se passe » (ex. 403 perm, erreur réseau).
        setError(`Lecture carte fidélité impossible (${lookup.status}).`);
        return;
      }
      const j = await lookup.json() as { customer_id: string | null };
      if (!j.customer_id) {
        setError(`Carte fidélité inconnue (${serial})`);
        return;
      }
      const cr = await fetch(`/api/customers/${j.customer_id}`);
      if (!cr.ok) { setError('Client de la carte introuvable.'); return; }
      const cj = await cr.json();
      const cu = cj.customer;
      if (!cu) { setError('Client de la carte introuvable.'); return; }
      await pickCustomer({
        id: cu.id,
        display_name: cu.company_name
          || [cu.first_name, cu.last_name].filter(Boolean).join(' ')
          || 'Client',
        type: cu.type ?? 'particulier',
        email: cu.email ?? null,
        phone: cu.phone ?? null,
        company_name: cu.company_name ?? null,
        default_discount_pct: Number(cu.default_discount_pct ?? 0),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const attachSerialRef = useRef(attachCustomerBySerial);
  attachSerialRef.current = attachCustomerBySerial;

  // Raccourcis clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        setSearchOpen(true);
        // Le champ est monté au prochain render : on le focuse juste après.
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === 'F2') { e.preventDefault(); setShowFreePrice({}); }
      else if (e.key === 'F4') { e.preventDefault(); setShowHeld(true); }
      else if (e.key === 'F9' && lines.length > 0) {
        e.preventDefault();
        // Comme le bouton « Payer » : on synchronise les lignes avec le
        // serveur avant d'ouvrir le paiement, sinon un F9 dans la fenêtre de
        // debounce (250 ms) validerait un total périmé (PAYMENTS_MISMATCH).
        if (shouldGoOffline()) { setShowPayment(true); }
        else { void (async () => { const id = await ensureSale(); if (id) { await syncLines(); setShowPayment(true); } })(); }
      }
      else if (e.key === 'Escape' && view.kind === 'products' && !searchQ) {
        e.preventDefault(); setView({ kind: 'categories' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines.length, view, searchQ]);

  // Refs pour que le listener global n'ait pas besoin d'être re-attaché
  // à chaque mise à jour de products / état modal.
  const productsRef = useRef<PosProduct[]>([]);
  useEffect(() => { productsRef.current = products; }, [products]);
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current =
      showPayment || showOpenSession || showHeld || showFreePrice !== null ||
      showPicker || discountLineKey !== null || justifyAction !== null ||
      cartActions !== null || showOrderModal || showScanner || receipt !== null;
  });

  // Scanner USB / douchette global : capture les caractères tapés
  // n'importe où sur la page caisse (hors champs texte ET hors modale
  // ouverte) et déclenche l'ajout au panier quand on reçoit Entrée.
  // Utilise document + capture phase + preventDefault pour intercepter
  // les frappes AVANT qu'elles n'atteignent les boutons (sinon un bouton
  // qui a le focus avalerait l'Entrée du scan et déclencherait un clic).
  useEffect(() => {
    const buf: { key: string; t: number }[] = [];
    const MIN_LEN = 3;
    const PURGE_MS = 500;

    function flush() { buf.length = 0; }

    function tryAddByCode(code: string) {
      const products = productsRef.current;
      const c = code.trim();
      if (!c) return;
      // Detection carte fidelite (Apple Wallet, Google Wallet, etc.) :
      // le serial commence par "FID". Normalise en strippant tout ce
      // qui n'est pas alphanum (evite les soucis de mapping clavier
      // qui remplacent '-' par '§' sur iPad AZERTY).
      const normalized = c.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (normalized.startsWith('FID') && normalized.length >= 6) {
        void attachSerialRef.current(normalized);
        return;
      }
      const match = matchProductByCode(products, c);
      if (match) addProduct(match);
      else setSearch(c);
    }

    function onKey(e: KeyboardEvent) {
      // Ne pas interférer si une modale est ouverte (chaque modale gère
      // son propre clavier — Escape, Entrée pour valider, etc.).
      if (modalOpenRef.current) return;

      // Le champ recherche a son propre handler ; on laisse les autres
      // inputs (numpad PIN, etc.) recevoir leurs frappes normalement.
      const tgt = e.target as HTMLElement | null;
      const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
      if (inField) return;

      const now = Date.now();
      if (buf.length && now - buf[buf.length - 1]!.t > PURGE_MS) flush();

      // Fin de séquence : Entrée OU Tab (certains scanners).
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.length >= MIN_LEN) {
          const code = buf.map((k) => k.key).join('');
          flush();
          // Bloque le comportement par défaut du focused button qui
          // déclencherait un clic non voulu.
          e.preventDefault();
          e.stopPropagation();
          tryAddByCode(code);
        } else {
          flush();
        }
        return;
      }

      // Caractères acceptés : alphanumériques + - . _ /
      if (e.key.length === 1 && /^[0-9a-zA-Z\-._/]$/.test(e.key)) {
        buf.push({ key: e.key, t: now });
        // Empêche le bouton focused d'avaler la touche ou de scroller.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Toute autre touche multi-caractère (Shift, Ctrl, Escape, F-keys…)
      // n'invalide pas le buffer (Shift est précédé par les digits).
    }

    // capture: true → on est appelé AVANT les listeners sur les boutons.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1) On attend la resolution du deviceId cote client.
  if (!deviceId) {
    return <div className="p-8 text-ink-soft">Chargement caisse…</div>;
  }

  // 2) Le poste n'est lie a aucune caisse : ecran de choix.
  if (pickerNeeded) {
    return (
      <RegisterPicker
        stores={stores}
        registers={registers}
        deviceId={deviceId}
        onBound={(sId, rId) => {
          setStoreId(sId);
          setRegisterId(rId);
          setPickerNeeded(false);
        }}
      />
    );
  }

  if (sessionLoading) {
    return <div className="p-8 text-ink-soft">Chargement caisse…</div>;
  }

  if (!sessionId) {
    const currentStore = stores.find((s) => s.id === storeId) ?? stores[0];
    const currentRegister = registers.find((r) => r.id === registerId);
    return (
      <>
        {onboarding?.first_time ? (
          <WelcomeOnboarding
            status={onboarding}
            storeName={currentStore?.name}
            onOpenCaisse={() => setShowOpenSession(true)}
          />
        ) : (
          <div className="h-full grid place-items-center px-4">
            <div className="card p-8 max-w-md w-full text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
                ◆
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Caisse fermée</h1>
              <p className="mt-2 text-sm text-ink-soft">
                {currentStore?.name ? `${currentStore.name}` : ''}
                {currentRegister?.name ? ` · ${currentRegister.name}` : ''}
                <br />Ouvrez la caisse pour commencer la journée.
              </p>
              <button
                className="btn-primary mt-6 w-full h-12 text-base"
                onClick={() => setShowOpenSession(true)}
              >
                Ouvrir la caisse
              </button>
            </div>
          </div>
        )}
        {showOpenSession && (
          <OpenSessionModal
            storeId={storeId}
            registerId={registerId}
            onClose={() => setShowOpenSession(false)}
            onOpened={() => { setShowOpenSession(false); void refreshSession(); }}
          />
        )}
      </>
    );
  }

  const showingProducts = searchQ.length > 0 || view.kind === 'products';
  const currentCategoryName = view.kind === 'products'
    ? (view.categoryId === 'uncategorized'
        ? 'Sans catégorie'
        : categories.find((c) => c.id === view.categoryId)?.name ?? '')
    : '';

  return (
    <div
      className="md:grid h-full flex flex-col overflow-hidden min-h-0"
      style={{ gridTemplateColumns: `1fr 6px ${ticketWidth}px` }}
    >
      {/* Gauche : catalogue. Sur mobile, écouter les swipes (gauche → ouvre panier).
          min-h-0 + min-w-0 + flex-col contraignent la grille / colonne
          pour que la zone .overflow-auto interne fonctionne et reste
          la SEULE à scroller (le bouton Encaisser du panier à droite
          reste toujours visible). */}
      <div
        className="relative flex flex-col bg-white min-w-0 min-h-0 flex-1 md:flex-none overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={(e) => onTouchEnd(e, 'open')}
      >
        <OfflineBanner />
        <div className="relative flex items-center gap-2 px-3 md:px-5 h-[68px] shrink-0 border-b border-border bg-white">
          {/* Barre de recherche VISIBLE : champ dès qu'ouverte, sinon une barre
              cliquable claire (pas une simple loupe). */}
          {searchOpen ? (
            <div className="flex-1 md:flex-none md:w-80 md:ml-auto relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden>
                <Icon name="search" size={18} />
              </span>
              <input
                ref={searchRef}
                autoFocus
                className="input h-12 w-full pl-10 pr-10 text-base"
                placeholder="Rechercher / scanner…"
                aria-label="Rechercher un article"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search.trim()) setSearchOpen(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); return; }
                  if (e.key === 'Enter' && search.trim()) {
                    const raw = search.trim();
                    const normalized = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    if (normalized.startsWith('FID') && normalized.length >= 6) {
                      void attachCustomerBySerial(normalized);
                      setSearch('');
                      return;
                    }
                    const match = matchProductByCode(products, raw);
                    if (match) { addProduct(match); setSearch(''); }
                  }
                }}
              />
              {search && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-full text-ink-soft hover:bg-gray-100 hover:text-ink"
                >
                  <span aria-hidden className="text-lg leading-none">×</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              title="Rechercher / scanner ( / )"
              aria-label="Rechercher un article"
              className="flex-1 md:flex-none md:w-80 md:ml-auto min-h-[52px] h-12 rounded-xl border border-border bg-white hover:bg-gray-50 flex items-center gap-2 px-3.5 text-ink-soft text-base text-left transition-colors"
            >
              <Icon name="search" size={20} />
              <span>Rechercher / scanner…</span>
            </button>
          )}
          {/* Scanner caméra : uniquement sur mobile/tablette. */}
          <button
            className="btn-ghost min-h-[52px] px-3.5 md:hidden"
            onClick={() => setShowScanner(true)}
            title="Scanner code-barres / QR"
            aria-label="Scanner"
          >
            <Icon name="camera" size={24} />
          </button>
          <button className="btn-soft min-h-[52px] px-5 text-base inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setShowHeld(true)} title="F4" aria-label="Paniers en attente">
            <span className="hidden md:inline">En attente</span>
            <span className="md:hidden"><Icon name="pause" size={22} /></span>
            {heldCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full text-[11px] font-semibold accent-bar text-white">
                {heldCount}
              </span>
            )}
          </button>
        </div>

        <div className="relative flex-1 overflow-auto p-3 md:p-5 pb-24 md:pb-5">
          {showingProducts ? (
            <>
              {/* Bouton retour en haut à gauche + libellé contextuel */}
              <div className="flex items-center gap-3 mb-3">
                {!searchQ && (
                  <button
                    onClick={() => setView({ kind: 'categories' })}
                    className="btn-soft inline-flex items-center gap-1.5 text-sm"
                  >
                    <Icon name="chevron-left" size={14} /> Retour
                  </button>
                )}
                <div className="text-sm font-semibold text-ink">
                  {searchQ ? `Résultats pour « ${searchQ} »` : currentCategoryName}
                </div>
              </div>

              <div className={`grid ${metrics.grid} ${metrics.gap}`}>
                {visibleProducts.length === 0 ? (
                  <div className="col-span-full text-center text-ink-soft mt-8">
                    {searchQ ? 'Aucun produit trouvé pour cette recherche.' : 'Aucun produit dans cette catégorie.'}
                  </div>
                ) : visibleProducts.map((p) => (
                  <ProductTile
                    key={p.id}
                    product={p}
                    onPick={onPickProductStable}
                    padding={metrics.padding}
                    titleFontSize={metrics.titleFontSize}
                    showImage={posUi.show_product_image}
                    showPrice={posUi.show_price}
                    showTaxBadge={posUi.show_tax_badge}
                  />
                ))}
              </div>
            </>
          ) : (
            // Vue par défaut : top articles + catégories dans la même grille
            <CategoryGrid
              categories={categoriesWithCounts.cats}
              uncategorizedCount={categoriesWithCounts.uncategorized}
              topProducts={topProducts}
              onPick={(id) => setView({ kind: 'products', categoryId: id })}
              onPickProduct={onPickProductStable}
              metrics={metrics}
              showImage={posUi.show_product_image}
              showPrice={posUi.show_price}
            />
          )}
        </div>
      </div>

      {/* Badge sync flottant : apparaît brièvement en haut à droite quand
          on persiste un changement vers le serveur (debounce ~250 ms).
          Non persistant, opacity-0 quand idle. */}
      <div
        className={`fixed top-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-white shadow-md border border-border px-3 py-1.5 text-xs text-ink-soft transition-opacity duration-300 pointer-events-none ${
          savingLines ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!savingLines}
        role="status"
      >
        <Icon name="sync" size={12} className="animate-spin-slow" />
        <span>Sync…</span>
      </div>

      {/* Splitter pour redimensionner le ticket (desktop uniquement) */}
      <div
        onMouseDown={() => { dragging.current = true; document.body.style.cursor = 'col-resize'; }}
        onDoubleClick={() => { setTicketWidth(DEFAULT_TICKET_WIDTH); localStorage.setItem('webpos_ticket_width', String(DEFAULT_TICKET_WIDTH)); }}
        className="hidden md:flex cursor-col-resize hover:bg-accent-soft transition-colors items-center justify-center group"
        title="Glisser pour redimensionner · Double-clic pour reset"
      >
        <div className="w-0.5 h-12 bg-border group-hover:bg-accent-deep rounded-full" />
      </div>

      {/* Barre panier flottante en bas (mobile) — alternative au swipe :
          un clic ouvre la feuille panier glissée depuis la droite. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-white shadow-[0_-6px_18px_rgba(0,0,0,0.06)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          onClick={() => setMobileCartOpen(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icon name="cart" size={18} />
            Panier
            <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 rounded-full text-xs font-semibold accent-bar text-white">
              {lines.length}
            </span>
          </span>
          <span className="text-lg font-semibold">{formatEUR(totals.ttc)}</span>
          <span className="rounded-xl accent-bar text-white px-4 py-2 text-sm font-semibold inline-flex items-center gap-1">
            Voir
            <Icon name="chevron-right" size={14} />
          </span>
        </button>
      </div>

      {/* Droite : panier. En desktop, colonne fixe à droite. En mobile,
          feuille glissée DEPUIS LA DROITE pleine hauteur — cohérent
          avec le geste de swipe horizontal (← ouvre, → ferme).
          pt-safe / pb-safe pour respecter les zones safe-area iOS. */}
      <aside
        onTouchStart={onTouchStart}
        onTouchEnd={(e) => onTouchEnd(e, 'close')}
        className={`
          size-original
          flex flex-col bg-white min-w-0 min-h-0 overflow-hidden
          md:border-l md:border-border md:static md:translate-x-0 md:visible md:opacity-100 md:p-0
          fixed inset-0 z-40 transition-transform duration-300 pt-safe pb-safe
          ${mobileCartOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        `}
      >
        {/* En-tête ticket : 2 lignes de boutons (max 3 par ligne).
            Ligne 1 : Retour (mobile) · En attente · Annuler.
            Ligne 2 : Remise · Commentaire (sous « En attente »). */}
        <div className="px-3 py-2.5 shrink-0 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileCartOpen(false)}
              className="md:hidden -ml-1 h-[56px] w-10 grid place-items-center text-ink-soft hover:text-ink text-2xl"
              aria-label="Retour aux articles (glissez à droite)"
            >
              ←
            </button>
            {/* « En attente » aligné à gauche ; « Annuler » poussé à droite. */}
            <button
              disabled={lines.length === 0 || !saleId}
              onClick={() => void holdSale()}
              className="btn-soft text-base font-medium min-h-[56px] px-5 whitespace-nowrap mr-auto"
              title="Mettre ce ticket en attente"
            >
              Mettre en attente
            </button>
            {/* Action destructive (remplace aussi « Vider » : même effet). */}
            <button
              disabled={lines.length === 0 && !saleId}
              onClick={async () => { setMobileCartOpen(true); if (await confirmThemed({ title: 'Annuler ce ticket', message: 'La vente en cours sera définitivement abandonnée.', confirmLabel: 'Annuler le ticket', cancelLabel: 'Retour', danger: true })) void cancelTicket(); }}
              className="text-base min-h-[56px] px-5 rounded-xl font-medium whitespace-nowrap border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              title="Annuler ce ticket"
            >
              <span aria-hidden className="text-lg leading-none">✕</span>
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <button
              disabled={lines.length === 0}
              onClick={() => setCartActions('discount')}
              className="btn-soft text-base font-medium min-h-[56px] px-5 whitespace-nowrap"
              title="Remise globale sur le ticket"
            >
              Remise
            </button>
            <button
              disabled={lines.length === 0 && !saleId}
              onClick={() => setCartActions('comment')}
              className="btn-soft text-base font-medium min-h-[56px] px-5 whitespace-nowrap"
              title="Ajouter un commentaire au ticket"
            >
              Commentaire
            </button>
            {/* Ouverture tiroir — VOLONTAIREMENT DISCRÈTE : icône neutre, aucun
                libellé texte ni infobulle explicite, pour ne pas signaler la
                fonction à une personne non autorisée passant derrière la caisse.
                L'éclair de confirmation (drawerFlash) est lui aussi neutre. */}
            <button
              onClick={() => void openDrawer()}
              disabled={drawerBusy}
              aria-label="Ouvrir le tiroir-caisse"
              className="btn-soft min-h-[56px] px-4 inline-flex items-center justify-center text-ink-soft disabled:opacity-60"
            >
              {drawerFlash ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Commentaire du ticket (visible en caisse, imprimé, et sur la facture) */}
        {cartComment && (
          <button
            onClick={() => setCartActions('comment')}
            className="w-full text-left px-3 py-2 border-b border-border bg-warning/5 flex items-start gap-2"
            title="Modifier le commentaire"
          >
            <span className="text-ink-soft mt-0.5 shrink-0"><Icon name="comment" size={14} /></span>
            <span className="text-sm text-ink whitespace-pre-wrap break-words">{cartComment}</span>
          </button>
        )}

        {/* Zone client */}
        <div className="px-3 py-2 border-b border-border space-y-2">
          {customer ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2">
                <a
                  href={`/customers?id=${customer.id}`}
                  className="min-w-0 text-left hover:opacity-80 transition-opacity"
                  title="Ouvrir la fiche client (le panier est conservé)"
                >
                  <div className="text-[10px] uppercase tracking-wider text-ink-soft">Client · voir la fiche</div>
                  <div className="text-sm font-medium truncate underline decoration-dotted underline-offset-2">
                    {customer.display_name}
                  </div>
                  {customer.default_discount_pct && customer.default_discount_pct > 0 && (
                    <div className="text-xs text-warning">Remise systématique : -{customer.default_discount_pct}%</div>
                  )}
                </a>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowPicker(true)}
                    className="text-sm text-accent-deep hover:bg-accent-soft rounded-lg px-3 h-10 font-medium"
                  >
                    Changer
                  </button>
                  <button
                    onClick={() => void detachCustomer()}
                    className="text-ink-soft hover:text-danger hover:bg-danger/10 rounded-lg h-10 w-10 grid place-items-center text-lg"
                    aria-label="Retirer le client"
                  >✕</button>
                </div>
              </div>
              {/* Pastilles soldes : cartes cadeau, avoirs, en compte. */}
              {customerBalances.gift_card_balance > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 text-sm">
                  <span className="text-accent-deep font-medium">Carte cadeau dispo</span>
                  <span className="font-semibold">{formatEUR(customerBalances.gift_card_balance)}</span>
                </div>
              )}
              {customerBalances.credit_notes_balance > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 text-sm">
                  <span className="text-accent-deep font-medium">↩ Avoir dispo</span>
                  <span className="font-semibold">{formatEUR(customerBalances.credit_notes_balance)}</span>
                </div>
              )}
              {customerBalances.account_balance < 0 && (
                <>
                  <div className="flex items-center justify-between rounded-xl bg-danger/10 px-3 py-2 text-sm">
                    <span className="text-danger font-medium">💳 En compte (dû)</span>
                    <span className="font-semibold text-danger">{formatEUR(customerBalances.account_balance)}</span>
                  </div>
                  <button
                    onClick={() => setShowSettle(true)}
                    className="w-full rounded-xl bg-danger/10 text-danger px-3 py-2 text-sm font-semibold hover:bg-danger/20"
                  >
                    Régler le solde ({formatEUR(-customerBalances.account_balance)})
                  </button>
                </>
              )}
              {customerBalances.account_balance > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-sm">
                  <span className="text-success font-medium">💳 Crédit en compte</span>
                  <span className="font-semibold">+{formatEUR(customerBalances.account_balance)}</span>
                </div>
              )}
              {loyalty.enabled && loyalty.balance_euros >= loyalty.min_redeem && loyalty.used === 0 && (
                <button
                  onClick={() => useLoyalty(loyalty.balance_euros)}
                  className="w-full rounded-xl bg-success/10 text-success px-3 py-2 text-sm font-medium hover:bg-success/20"
                >
                  ✦ Utiliser {formatEUR(loyalty.balance_euros)} de fidélité
                </button>
              )}
              {loyalty.used > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-sm">
                  <span className="text-success font-medium">Fidélité utilisée : -{formatEUR(loyalty.used)}</span>
                  <button onClick={() => removeLoyalty()} className="text-ink-soft hover:text-danger text-xs">retirer</button>
                </div>
              )}
              {loyalty.enabled && loyalty.balance_euros < loyalty.min_redeem && loyalty.balance_euros > 0 && (
                <div className="text-xs text-ink-soft text-center">
                  Solde fidélité : {formatEUR(loyalty.balance_euros)} (seuil {formatEUR(loyalty.min_redeem)})
                </div>
              )}
            </>
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full rounded-xl border border-dashed border-border px-3 py-3 text-base text-ink-soft hover:border-gray-300 hover:text-ink"
            >
              + Associer un client
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
          {lines.length === 0 ? (
            <div className="mt-12 text-center text-ink-soft text-sm px-3">
              Sélectionnez un produit pour commencer.
            </div>
          ) : lines.map((l) => {
            const sub = Math.max(0, round2(l.unit_price_ttc * l.quantity - l.discount_amount));
            return (
              <button
                key={l.key}
                onClick={() => setDiscountLineKey(l.key)}
                // Fond teinté de la couleur d'accent du poste : les articles
                // encaissés se détachent du panneau blanc, et les commandes
                // (croix, − / +) restent en blanc franc par-dessus, donc
                // lisibles. La teinte vient de `--primary-soft`, donc elle
                // suit le thème choisi dans les paramètres, mode sombre inclus.
                //
                // `text-ink` explicite plutôt qu'hérité. L'héritage suffirait
                // désormais — <body> suit l'encre du mode sombre depuis la
                // correction globale — mais l'affirmer ici coûte une classe et
                // rend la tuile indépendante de cette mécanique.
                className="w-full text-left rounded-lg border px-2 py-1 text-ink bg-accent-soft border-accent-soft-line hover:border-accent transition-colors"
                title="Cliquer pour ajouter / modifier une remise"
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="text-sm font-medium flex-1 truncate leading-tight">{l.label}</div>
                  <span className="font-semibold text-sm whitespace-nowrap">{formatEUR(sub)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeLine(l.key); }}
                    className="h-6 w-6 grid place-items-center rounded-lg text-ink-soft hover:bg-danger/10 hover:text-danger text-xs shrink-0"
                    aria-label="Retirer cet article"
                  >✕</button>
                </div>
                <div className="mt-0 flex items-center justify-between text-xs text-ink-soft">
                  <span className="leading-tight">
                    {formatEUR(l.unit_price_ttc)}
                    {l.discount_amount > 0 && <span className="text-warning ml-1">· -{formatEUR(l.discount_amount)}</span>}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="h-7 w-7 rounded-lg border border-border bg-white text-sm font-medium active:scale-95"
                      onClick={() => incLine(l.key, -1)}
                      aria-label="Réduire la quantité"
                    >−</button>
                    <span className="w-7 text-center text-ink text-sm font-semibold tabular-nums">{l.quantity}</span>
                    <button
                      className="h-7 w-7 rounded-lg border border-border bg-white text-sm font-medium active:scale-95"
                      onClick={() => incLine(l.key, +1)}
                      aria-label="Augmenter la quantité"
                    >+</button>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-4 py-2.5 space-y-1 text-sm">
          {totals.discount > 0 && (
            <div className="flex justify-between text-warning text-xs">
              <span>Remises</span><span>-{formatEUR(totals.discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-semibold">Total</span>
            <span className="text-2xl font-semibold tracking-tight">{formatEUR(totals.ttc)}</span>
          </div>
        </div>

        <div className="p-2.5 border-t border-border space-y-2">
          {deferredEnabled && (
            <button
              disabled={lines.length === 0 || totals.ttc <= 0}
              className="btn-soft w-full h-12 text-base font-semibold"
              onClick={() => setShowOrderModal(true)}
            >
              Commande / Livraison
            </button>
          )}

          {/* Un seul bouton « Paiement » : il ouvre la page de règlement plein
              écran (choix du mode : espèces, carte, chèque, multiple, lien
              Stripe, avoir, carte cadeau…). Cas particulier : vente à 0 €
              (offerte / entièrement remisée) → bouton « Valider » direct car
              aucun règlement n'est nécessaire. */}
          {lines.length > 0 && totals.ttc === 0 ? (
            <button
              onClick={() => void validateZeroSale()}
              className="btn-primary h-16 w-full text-xl font-semibold rounded-xl flex items-center justify-center gap-3"
              title="Valider la vente offerte (0 €)"
            >
              <span>Valider · 0 €</span>
            </button>
          ) : (
            <button
              disabled={lines.length === 0 || totals.ttc <= 0}
              onClick={async () => {
                if (shouldGoOffline()) { setShowPayment(true); return; }
                const id = await ensureSale(); if (id) { await syncLines(); setShowPayment(true); }
              }}
              className="btn-primary h-16 w-full text-xl font-semibold rounded-xl flex items-center justify-center gap-3 disabled:opacity-40"
              title="Ouvrir le règlement"
            >
              <span>Paiement</span>
            </button>
          )}
        </div>

        {error && (
          <div className="border-t border-danger/20 bg-danger/5 px-4 py-2 text-xs text-danger">
            {error}
          </div>
        )}
      </aside>

      {showPayment && (saleId || shouldGoOffline()) && (
        <PaymentModal
          saleId={saleId ?? ''}
          totalTtc={totals.ttc}
          lines={lines}
          storeId={storeId}
          hasCustomer={!!customer}
          loyaltyRedemption={loyalty.used > 0 ? loyalty.used : undefined}
          schoolMode={schoolMode}
          offlineEnabled={offlinePosEnabled()}
          onOfflineFinalize={(payments, loyaltyUsed) => finalizeOffline(payments, loyaltyUsed)}
          onClose={() => setShowPayment(false)}
          onValidated={onValidated}
        />
      )}
      {showSettle && customer && customerBalances.account_balance < 0 && (
        <PaymentModal
          saleId={saleId ?? ''}
          totalTtc={round2(-customerBalances.account_balance)}
          storeId={storeId}
          settlement={{ customerId: customer.id }}
          onClose={() => setShowSettle(false)}
          onValidated={() => {}}
          onSettled={(res) => {
            setShowSettle(false);
            setCustomerBalances((b) => ({ ...b, account_balance: res.new_balance }));
            setError(null);
          }}
        />
      )}
      {receipt && (
        <ReceiptPreviewModal
          receipt={receipt}
          storeId={storeId}
          onClose={() => {
            setReceipt(null);
            // C'est maintenant qu'on signale la fin de la vente : la modale a
            // été ouverte le temps de visualiser / imprimer / envoyer.
            window.dispatchEvent(new CustomEvent('webpos:sale_validated'));
          }}
        />
      )}
      {showHeld && (
        <HoldListModal
          storeId={storeId}
          onClose={() => setShowHeld(false)}
          onPick={recallSale}
        />
      )}
      {showFreePrice && (
        <FreePriceModal
          defaultTaxCode={storeTaxDefaults?.[storeId] ?? taxRates.find((t) => t.is_default)?.code ?? FREE_PRICE_TAX_CODE_DEFAULT}
          defaultLabel={showFreePrice.label}
          taxRates={taxRates}
          onClose={() => setShowFreePrice(null)}
          onConfirm={addFreeBouquet}
        />
      )}
      {showPicker && (
        <CustomerPickerModal
          onClose={() => setShowPicker(false)}
          onPick={(c) => void pickCustomer(c)}
        />
      )}
      {discountLineKey && (() => {
        const l = lines.find((x) => x.key === discountLineKey);
        if (!l) return null;
        return (
          <LineDiscountModal
            label={l.label}
            unitPriceTtc={l.unit_price_ttc}
            quantity={l.quantity}
            currentDiscount={l.discount_amount}
            onClose={() => setDiscountLineKey(null)}
            onSave={(amount) => {
              setDiscountLineKey(null);
              if (amount === 0) { setLineDiscount(l.key, 0); return; }
              // Toute remise manuelle déclenche une justification
              setJustifyAction({ kind: 'lineDiscount', key: l.key, amount });
            }}
          />
        );
      })()}
      {showOrderModal && (
        <OrderModal
          lines={lines}
          customer={customer}
          totalTtc={totals.ttc}
          storeId={storeId}
          saleId={saleId}
          deliveryProduct={products.find((p) => /livraison|delivery/i.test(p.name))}
          onClose={() => setShowOrderModal(false)}
          onSaved={() => {
            setShowOrderModal(false);
            setLines([]); setSaleId(null); setCustomer(null);
            setView({ kind: 'categories' });
          }}
          onPayNow={async () => {
            // Encaisser maintenant : on ferme OrderModal, on s'assure que les
            // lignes sont sync, puis on ouvre PaymentModal — flow caisse
            // classique. Le delivery_info a déjà été PATCH sur la vente.
            setShowOrderModal(false);
            const id = await ensureSale();
            if (id) {
              await syncLines();
              setShowPayment(true);
            }
          }}
        />
      )}

      {showScanner && (
        <BarcodeScannerModal
          onClose={() => setShowScanner(false)}
          onScan={addByCode}
        />
      )}

      {cartActions && (
        <CartActionsModal
          only={cartActions}
          cartTotal={totals.ttc}
          currentComment={cartComment}
          onClose={() => setCartActions(null)}
          onCartDiscount={(mode, value) => {
            const computed = mode === 'percent'
              ? round2((totals.ttc * value) / 100)
              : Math.min(round2(value), round2(totals.ttc));
            if (computed <= 0) return;
            setCartActions(null);
            setJustifyAction({ kind: 'cartDiscount', amount: computed, mode });
          }}
          onCommentSave={(c) => { setCartComment(c); void persistComment(c); setCartActions(null); }}
        />
      )}
      {justifyAction && (() => {
        const a = justifyAction;
        return (
          <JustificationModal
            title={
              a.kind === 'remove' ? 'Sortie d\'un produit'
              : a.kind === 'lineDiscount' ? 'Remise sur ligne'
              : 'Remise globale panier'
            }
            description={
              a.kind === 'remove' ? 'Indiquez la raison du retrait de l\'article du panier.'
              : 'Toute remise manuelle doit être justifiée.'
            }
            onClose={() => setJustifyAction(null)}
            onConfirm={(reason) => {
              if (a.kind === 'remove') {
                removeLine(a.key);
              } else if (a.kind === 'lineDiscount') {
                setLines((cur) => cur.map((l) => l.key === a.key
                  ? { ...l, discount_amount: a.amount, metadata: { ...l.metadata, manual_discount_reason: reason } }
                  : l));
              } else if (a.kind === 'cartDiscount') {
                const subtotal = lines.reduce((s, l) => s + round2(l.unit_price_ttc * l.quantity - l.discount_amount), 0);
                if (subtotal > 0) {
                  setLines((cur) => {
                    const weights = cur.map((l) => round2(l.unit_price_ttc * l.quantity - l.discount_amount));
                    const parts = distributeProrata(a.amount, weights);
                    return cur.map((l, i) => ({
                      ...l,
                      discount_amount: round2(l.discount_amount + (parts[i] ?? 0)),
                      metadata: { ...l.metadata, cart_discount: true, cart_discount_reason: reason },
                    }));
                  });
                }
              }
              setJustifyAction(null);
            }}
          />
        );
      })()}
    </div>
  );
}

function CategoryGrid({
  categories, uncategorizedCount, topProducts, onPick, onPickProduct, metrics, showImage, showPrice,
}: {
  categories: (Category & { count: number })[];
  uncategorizedCount: number;
  topProducts: PosProduct[];
  onPick: (id: string | 'uncategorized') => void;
  onPickProduct: (p: PosProduct) => void;
  metrics: ReturnType<typeof tileMetrics>;
  showImage: boolean;
  showPrice: boolean;
}) {
  if (categories.length === 0 && uncategorizedCount === 0 && topProducts.length === 0) {
    return (
      <div className="text-center text-ink-soft mt-12">
        Aucun produit. Ajoutez-en dans <a className="underline" href="/products">Produits</a>.
      </div>
    );
  }
  return (
    <div className={`grid ${metrics.grid} ${metrics.gap}`}>
      {topProducts.map((p) => (
        <TopProductTile
          key={`top-${p.id}`}
          product={p}
          onPick={() => onPickProduct(p)}
          metrics={metrics}
          showImage={showImage}
          showPrice={showPrice}
        />
      ))}
      {categories.map((c) => (
        <CategoryTile key={c.id} category={c} onPick={() => onPick(c.id)} metrics={metrics} />
      ))}
      {uncategorizedCount > 0 && (
        <CategoryTile
          category={{
            id: 'uncategorized', name: 'Sans catégorie', color: '#F5F5F5',
            // Le fourre-tout mérite son repère : sans lui il serait la seule
            // tuile nue au milieu de tuiles illustrées.
            icon: 'dots', image_url: null, count: uncategorizedCount,
          }}
          onPick={() => onPick('uncategorized')}
          metrics={metrics}
        />
      )}
    </div>
  );
}

function TopProductTile({
  product: p, onPick, metrics, showImage, showPrice,
}: {
  product: PosProduct;
  onPick: () => void;
  metrics: ReturnType<typeof tileMetrics>;
  showImage: boolean;
  showPrice: boolean;
}) {
  // Même apparence que les tuiles catégorie : tuile pleine couleur claire,
  // nom du produit centré, prix optionnel en bas.
  return (
    <button
      onClick={onPick}
      className="rounded-2xl border border-border overflow-hidden hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98] aspect-[5/3] grid place-items-center px-3 bg-accent-soft"
      title="Top produit"
    >
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        {showImage && p.image_url && (
          <img src={p.image_url} alt="" className="h-10 w-10 rounded-md object-cover mb-1" />
        )}
        <span className={`${metrics.titleFontSize} font-semibold text-ink leading-tight line-clamp-2`}>
          {p.name}
        </span>
        {showPrice && !p.price_is_free && (
          <span className="text-xs text-ink-soft">{formatEUR(p.sale_price_ttc)}</span>
        )}
      </div>
    </button>
  );
}

function CategoryTile({
  category: c, onPick, metrics,
}: {
  category: {
    id: string; name: string; color: string | null;
    icon?: string | null; image_url: string | null; count: number;
  };
  onPick: () => void;
  metrics: ReturnType<typeof tileMetrics>;
}) {
  const hasImage = !!c.image_url;
  const iconDef = !hasImage ? categoryIconDef(c.icon) : null;

  // Tuile à icône : carte claire, dessin au centre, nom dessous et un filet de
  // la couleur de la catégorie. La couleur ne remplit plus toute la tuile —
  // elle devient un repère, et c'est le dessin qui se reconnaît de loin.
  if (iconDef) {
    return (
      <button
        onClick={onPick}
        className="rounded-2xl border border-border bg-surface overflow-hidden hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98] aspect-[5/3] flex flex-col items-center justify-center gap-1.5 px-3"
      >
        <span className="text-accent-deep">
          <CategoryIcon name={c.icon} size={metrics.iconSize} strokeWidth={1.5} />
        </span>
        <span className={`${metrics.titleFontSize} font-semibold text-center text-ink leading-tight line-clamp-2`}>
          {c.name}
        </span>
        <span
          className="h-1 w-8 rounded-full"
          style={{ background: c.color && c.color !== '#FFFFFF' ? c.color : 'var(--primary-soft)' }}
        />
      </button>
    );
  }

  if (hasImage) {
    return (
      <button
        onClick={onPick}
        className={`card ${metrics.padding} text-left hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98]`}
      >
        <div className="mb-2 h-20 w-full rounded-lg overflow-hidden grid place-items-center"
             style={{ background: c.color ?? '#F5F5F5' }}>
          <img src={c.image_url!} alt="" className="h-full w-full object-cover" />
        </div>
        <div className={`${metrics.titleFontSize} ${metrics.titleMinHeight} font-medium leading-tight`}>
          {c.name}
        </div>
      </button>
    );
  }
  // Sans image : tuile entièrement colorée + nom centré
  return (
    <button
      onClick={onPick}
      className="rounded-2xl border border-border overflow-hidden hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98] aspect-[5/3] grid place-items-center px-3"
      style={{ background: c.color ?? '#F5F5F5' }}
    >
      <span className={`${metrics.titleFontSize} font-semibold text-center text-ink leading-tight`}>
        {c.name}
      </span>
    </button>
  );
}

function cryptoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/**
 * Répartit `target` € sur des poids, au centime près, sans dérive : méthode du
 * plus fort reste → la somme des parts vaut EXACTEMENT `target` (arrondi au
 * centime). Évite qu'une remise de 10,00 € tombe en 9,99 / 10,01 €.
 */
function distributeProrata(target: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const targetCents = Math.round(target * 100);
  const raw = weights.map((w) => (w / total) * targetCents);
  const cents = raw.map((r) => Math.floor(r));
  let remainder = targetCents - cents.reduce((s, c) => s + c, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    const idx = order[k]!.i;
    cents[idx] = (cents[idx] ?? 0) + 1;
    remainder--;
  }
  return cents.map((c) => c / 100);
}

/**
 * Tuile produit mémoïsée : ne se re-render que si ses props changent (produit,
 * réglages d'affichage). Empêche le re-render de toute la grille (jusqu'à 500
 * tuiles) à chaque modification du panier.
 */
const ProductTile = memo(function ProductTile({
  product, onPick, padding, titleFontSize, showImage, showPrice, showTaxBadge,
}: {
  product: PosProduct;
  onPick: (p: PosProduct) => void;
  padding: string;
  titleFontSize: string;
  showImage: boolean;
  showPrice: boolean;
  showTaxBadge: boolean;
}) {
  return (
    <button
      onClick={() => onPick(product)}
      className={`card ${padding} hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98] aspect-[5/3] grid place-items-center text-center`}
      style={product.color ? { backgroundColor: product.color } : undefined}
    >
      <div className="flex flex-col items-center justify-center gap-1.5 max-w-full">
        {showImage && product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt="" className="h-12 w-12 rounded-md object-cover mb-1" />
        )}
        <span className={`${titleFontSize} font-semibold text-ink leading-tight line-clamp-2`}>
          {product.name}
        </span>
        {showPrice && (
          <span className="text-sm font-medium text-ink-soft">
            {product.price_is_free ? 'prix libre' : formatEUR(product.sale_price_ttc)}
          </span>
        )}
        {showTaxBadge && (
          <span className="chip text-[10px] px-1.5 py-0">{product.tax_rate}%</span>
        )}
      </div>
    </button>
  );
});
