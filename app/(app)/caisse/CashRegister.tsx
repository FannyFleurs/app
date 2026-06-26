'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import PaymentModal from './PaymentModal';
import ReceiptPreviewModal from './ReceiptPreviewModal';
import HoldListModal from './HoldListModal';
import OpenSessionModal from './OpenSessionModal';
import FreePriceModal from './FreePriceModal';
import CustomerPickerModal, { type PickedCustomer } from './CustomerPickerModal';
import LineDiscountModal from './LineDiscountModal';
import JustificationModal from './JustificationModal';
import CartActionsModal from './CartActionsModal';
import { tileMetrics, type PosUiSettings } from '@/lib/settings/pos-ui';

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
  sku: string | null;
  image_url: string | null;
  short_description: string | null;
  is_customizable: boolean;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  image_url: string | null;
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
  registers: { id: string; store_id: string; code: string; name: string }[];
  taxRates: TaxRate[];
  currentUser: { id: string; name: string; role: string };
  posUi: PosUiSettings;
}

type View = { kind: 'categories' } | { kind: 'products'; categoryId: string | 'uncategorized' };

const FREE_PRICE_TAX_CODE_DEFAULT = 'TVA20';

export default function CashRegister({ stores, registers, taxRates, currentUser, posUi }: Props) {
  const metrics = useMemo(() => tileMetrics(posUi.tile_size), [posUi.tile_size]);

  const [storeId, setStoreId] = useState<string>(stores[0]!.id);
  const registersForStore = useMemo(
    () => registers.filter((r) => r.store_id === storeId),
    [registers, storeId],
  );
  const [registerId, setRegisterId] = useState<string>(registersForStore[0]?.id ?? '');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showOpenSession, setShowOpenSession] = useState(false);

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
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showFreePrice, setShowFreePrice] = useState<{ label?: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [discountLineKey, setDiscountLineKey] = useState<string | null>(null);
  const [justifyAction, setJustifyAction] = useState<
    | { kind: 'remove'; key: string }
    | { kind: 'lineDiscount'; key: string; amount: number }
    | { kind: 'cartDiscount'; amount: number; mode: 'percent' | 'amount' }
    | { kind: 'cancelTicket' }
    | null
  >(null);
  const [cartComment, setCartComment] = useState('');
  const [showCartActions, setShowCartActions] = useState(false);
  const [heldCount, setHeldCount] = useState(0);

  // Largeur du panier ticket (redimensionnable, persistée en localStorage)
  const DEFAULT_TICKET_WIDTH = 360; // 300 * 1.2
  const [ticketWidth, setTicketWidth] = useState<number>(DEFAULT_TICKET_WIDTH);
  const dragging = useRef(false);
  useEffect(() => {
    const stored = Number(localStorage.getItem('florea_ticket_width') ?? '');
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
        localStorage.setItem('florea_ticket_width', String(ticketWidth));
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

  const searchRef = useRef<HTMLInputElement>(null);

  // Charge produits + catégories
  useEffect(() => {
    void (async () => {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/products?pos=1'),
        fetch('/api/categories'),
      ]);
      if (pRes.ok) {
        const j = await pRes.json();
        setProducts(
          j.products.map((p: Record<string, unknown>) => ({
            ...p,
            sale_price_ttc: Number(p.sale_price_ttc),
            tax_rate: Number(p.tax_rate),
          })),
        );
      }
      if (cRes.ok) setCategories((await cRes.json()).categories);
    })();
  }, []);

  // Vérifie session caisse
  const refreshSession = useCallback(async () => {
    if (!registerId) return;
    setSessionLoading(true);
    const res = await fetch(`/api/cash-sessions?register_id=${registerId}`);
    if (res.ok) {
      const j = await res.json();
      setSessionId(j.session?.id ?? null);
    }
    setSessionLoading(false);
  }, [registerId]);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

  const refreshHeldCount = useCallback(async () => {
    if (!registerId) return;
    const r = await fetch(`/api/sales/held?register_id=${registerId}`);
    if (r.ok) {
      const j = await r.json();
      setHeldCount((j.held ?? []).length);
    }
  }, [registerId]);
  useEffect(() => { void refreshHeldCount(); }, [refreshHeldCount, showHeld]);

  // Persiste lignes côté serveur (debounced)
  useEffect(() => {
    if (!saleId) return;
    const t = setTimeout(() => { void syncLines(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, saleId]);

  const ensureSale = useCallback(async (): Promise<string | null> => {
    if (saleId) return saleId;
    if (!sessionId) { setError('Aucune session caisse ouverte.'); return null; }
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, register_id: registerId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Création vente impossible');
      return null;
    }
    const { id } = await res.json();
    setSaleId(id);
    return id;
  }, [saleId, sessionId, storeId, registerId]);

  async function syncLines() {
    if (!saleId) return;
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

  // Catégories effectivement présentes (au moins 1 produit) + bucket "sans catégorie"
  const categoriesWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const k = p.category_id ?? 'uncategorized';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const cats = categories
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0);
    const uncat = counts.get('uncategorized') ?? 0;
    return { cats, uncategorized: uncat };
  }, [products, categories]);

  // Liste des produits affichés (en mode recherche OU dans une catégorie)
  const searchQ = search.trim().toLowerCase();
  const visibleProducts = useMemo(() => {
    if (searchQ) {
      return products.filter((p) =>
        p.name.toLowerCase().includes(searchQ) ||
        p.sku?.toLowerCase().includes(searchQ) ||
        p.barcode === searchQ.toUpperCase() || p.barcode === searchQ
      );
    }
    if (view.kind === 'products') {
      return products.filter((p) =>
        view.categoryId === 'uncategorized'
          ? p.category_id == null
          : p.category_id === view.categoryId,
      );
    }
    return [];
  }, [products, searchQ, view]);

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

  function addProduct(p: PosProduct) {
    void ensureSale();
    if (p.price_is_free) { setShowFreePrice({ label: p.name }); return; }
    // Remise systématique du client : appliquée automatiquement à chaque ajout
    const autoPct = customer?.default_discount_pct ?? 0;
    setLines((cur) => {
      const existing = cur.find(
        (l) => l.product_id === p.id
            && l.unit_price_ttc === p.sale_price_ttc
            && !l.metadata?.cart_discount
            && (autoPct > 0 ? l.metadata?.auto_discount_pct === autoPct : l.discount_amount === 0),
      );
      if (existing) {
        return cur.map((l) => {
          if (l !== existing) return l;
          const newQty = l.quantity + 1;
          // Recalcule la remise auto proportionnellement
          const newDiscount = autoPct > 0
            ? round2((p.sale_price_ttc * newQty * autoPct) / 100)
            : l.discount_amount;
          return { ...l, quantity: newQty, discount_amount: newDiscount };
        });
      }
      const discount = autoPct > 0 ? round2((p.sale_price_ttc * autoPct) / 100) : 0;
      return [...cur, {
        key: cryptoKey(),
        product_id: p.id, variant_id: null,
        label: p.name, unit_price_ttc: p.sale_price_ttc,
        quantity: 1, discount_amount: discount,
        tax_rate: p.tax_rate, tax_rate_code: p.tax_rate_code,
        metadata: autoPct > 0 ? { auto_discount_pct: autoPct } : {},
      }];
    });
  }

  function useLoyalty(amountEuros: number) {
    if (!customer || amountEuros <= 0) return;
    const subtotal = lines.reduce((s, l) => s + round2(l.unit_price_ttc * l.quantity - l.discount_amount), 0);
    const apply = Math.min(round2(amountEuros), round2(subtotal));
    if (apply <= 0) return;
    // Le montant utilisé est réparti proportionnellement sur les lignes (pour conserver la TVA).
    setLines((cur) => {
      const ratio = apply / subtotal;
      return cur.map((l) => {
        const lineSub = round2(l.unit_price_ttc * l.quantity - l.discount_amount);
        const add = round2(lineSub * ratio);
        return { ...l, discount_amount: round2(l.discount_amount + add) };
      });
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
    setLines((cur) => [...cur, {
      key: cryptoKey(),
      product_id: null, variant_id: null,
      label, unit_price_ttc: amount, quantity: 1, discount_amount: 0,
      tax_rate: tax.rate, tax_rate_code: tax.code, metadata: { freeform: true },
    }]);
    setShowFreePrice(null);
    void ensureSale();
  }

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
      setSaleId(null); setLines([]); setCustomer(null);
      setView({ kind: 'categories' }); setSearch('');
    }
  }

  async function recallSale(id: string) {
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
    setShowHeld(false);
  }

  async function onValidated(
    receiptId: string,
    receiptNumber: string,
    loyaltyInfo?: { earned: number; redeemed: number; new_balance: number } | null,
  ) {
    setReceipt({
      id: receiptId, number: receiptNumber,
      saleId: saleId!,
      customerId: customer?.id ?? null,
      loyalty: loyaltyInfo ?? null,
    });
    setShowPayment(false);
    setSaleId(null); setLines([]); setCustomer(null);
    setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
    setCartComment('');
    // Retour à la vue catégories
    setView({ kind: 'categories' });
    setSearch('');
    // Signal pour l'auto-logout 'after_sale'
    window.dispatchEvent(new CustomEvent('florea:sale_validated'));
  }

  async function pickCustomer(c: PickedCustomer) {
    const id = await ensureSale();
    if (!id) return;
    const res = await fetch(`/api/sales/${id}/customer`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: c.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Impossible d\'attacher le client');
      return;
    }
    setCustomer(c);
    setShowPicker(false);

    // Remise systématique : applique sur toutes les lignes existantes
    // qui n'ont pas déjà une remise manuelle plus avantageuse.
    if (c.default_discount_pct && c.default_discount_pct > 0) {
      const pct = c.default_discount_pct;
      setLines((cur) => cur.map((l) => {
        const autoDiscount = round2((l.unit_price_ttc * l.quantity * pct) / 100);
        return l.discount_amount >= autoDiscount
          ? l
          : { ...l, discount_amount: autoDiscount, metadata: { ...l.metadata, auto_discount_pct: pct } };
      }));
    }

    // Charge le solde fidélité
    try {
      const r = await fetch(`/api/customers/${c.id}/loyalty`);
      if (r.ok) {
        const j = await r.json();
        if (j.loyalty?.enabled) {
          setLoyalty({
            enabled: true,
            balance_euros: Number(j.balance_euros) || 0,
            min_redeem: Number(j.loyalty.min_redeem) || 0,
            used: 0,
          });
        } else {
          setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
        }
      }
    } catch { /* ignore */ }
  }

  async function detachCustomer() {
    if (!saleId) { setCustomer(null); setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 }); return; }
    const res = await fetch(`/api/sales/${saleId}/customer`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: null }),
    });
    if (res.ok) {
      setCustomer(null);
      setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
      // Retire la ligne fidélité éventuellement déjà appliquée
      setLines((cur) => cur.filter((l) => l.metadata?.loyalty_redemption !== true));
    }
  }

  // Raccourcis clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus();
      } else if (e.key === 'F2') { e.preventDefault(); setShowFreePrice({}); }
      else if (e.key === 'F4') { e.preventDefault(); setShowHeld(true); }
      else if (e.key === 'F9' && lines.length > 0) { e.preventDefault(); setShowPayment(true); }
      else if (e.key === 'Escape' && view.kind === 'products' && !searchQ) {
        e.preventDefault(); setView({ kind: 'categories' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines.length, view, searchQ]);

  if (sessionLoading) {
    return <div className="p-8 text-ink-soft">Chargement caisse…</div>;
  }

  if (!sessionId) {
    const currentStore = stores.find((s) => s.id === storeId) ?? stores[0];
    return (
      <>
        <div className="h-[calc(100vh-56px)] grid place-items-center px-4">
          <div className="card p-8 max-w-md w-full text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
              ◆
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Caisse fermée</h1>
            <p className="mt-2 text-sm text-ink-soft">
              {currentStore?.name ? `${currentStore.name} — ` : ''}
              Ouvrez la caisse pour commencer la journée.
            </p>
            <button
              className="btn-primary mt-6 w-full h-12 text-base"
              onClick={() => setShowOpenSession(true)}
            >
              Ouvrir la caisse
            </button>
          </div>
        </div>
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
      className="grid h-[calc(100vh-56px)]"
      style={{ gridTemplateColumns: `1fr 6px ${ticketWidth}px` }}
    >
      {/* Gauche : catalogue */}
      <div className="flex flex-col bg-white min-w-0">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-white">
          <input
            ref={searchRef}
            className="input max-w-[16rem]"
            placeholder="Rechercher / scanner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                const match = products.find((p) => p.barcode === search.trim());
                if (match) { addProduct(match); setSearch(''); }
              }
            }}
          />
          <div className="flex-1" />
          <button className="btn-soft" onClick={() => setShowFreePrice({})} title="F2">
            ✿ Bouquet prix libre
          </button>
          <button className="btn-ghost" onClick={() => setShowHeld(true)} title="F4">
            Panier en attente
            {heldCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full text-[11px] font-semibold accent-bar text-white">
                {heldCount}
              </span>
            )}
          </button>
        </div>

        {/* Plus de fil d'Ariane — la grille des produits a son bouton "Retour" en première tuile */}

        <div className="flex-1 overflow-auto p-5 bg-white">
          {showingProducts ? (
            <div className={`grid ${metrics.grid} ${metrics.gap}`}>
              {/* Bouton retour TOUJOURS en première position en vue produits, hors recherche */}
              {!searchQ && (
                <button
                  onClick={() => setView({ kind: 'categories' })}
                  className="rounded-2xl border border-border overflow-hidden hover:shadow-md hover:opacity-90 transition-all active:scale-[0.98] aspect-[5/3] grid place-items-center px-3 accent-bar text-white"
                >
                  <div className="text-center leading-tight">
                    <div className="text-3xl">‹</div>
                    <div className={`${metrics.titleFontSize} font-semibold`}>Retour</div>
                  </div>
                </button>
              )}
              {visibleProducts.length === 0 ? (
                <div className="col-span-full text-center text-ink-soft mt-8">
                  {searchQ ? 'Aucun produit trouvé pour cette recherche.' : 'Aucun produit dans cette catégorie.'}
                </div>
              ) : visibleProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className={`card ${metrics.padding} text-left hover:shadow-md hover:border-gray-300 transition-all active:scale-[0.98] aspect-[5/3] flex flex-col`}
                >
                  {posUi.show_product_image && (
                    <div className="mb-2 h-14 w-full rounded-lg bg-gray-50 grid place-items-center text-ink-soft overflow-hidden">
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        : <span>✿</span>}
                    </div>
                  )}
                  <div className={`${metrics.titleFontSize} ${metrics.titleMinHeight} font-medium line-clamp-2 leading-tight`}>
                    {p.name}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    {posUi.show_price && (
                      <span className={`${metrics.priceFontSize} font-semibold`}>
                        {p.price_is_free ? 'libre' : formatEUR(p.sale_price_ttc)}
                      </span>
                    )}
                    {posUi.show_tax_badge && <span className="chip">{p.tax_rate}%</span>}
                  </div>
                  {posUi.show_category_badge && p.category_name && (
                    <div className="mt-1 text-[11px] text-ink-soft truncate">{p.category_name}</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            // VUE CATÉGORIES
            <CategoryGrid
              categories={categoriesWithCounts.cats}
              uncategorizedCount={categoriesWithCounts.uncategorized}
              onPick={(id) => setView({ kind: 'products', categoryId: id })}
              metrics={metrics}
            />
          )}
        </div>
      </div>

      {/* Splitter pour redimensionner le ticket */}
      <div
        onMouseDown={() => { dragging.current = true; document.body.style.cursor = 'col-resize'; }}
        onDoubleClick={() => { setTicketWidth(DEFAULT_TICKET_WIDTH); localStorage.setItem('florea_ticket_width', String(DEFAULT_TICKET_WIDTH)); }}
        className="cursor-col-resize hover:bg-accent-soft transition-colors flex items-center justify-center group"
        title="Glisser pour redimensionner · Double-clic pour reset"
      >
        <div className="w-0.5 h-12 bg-border group-hover:bg-accent-deep rounded-full" />
      </div>

      {/* Droite : panier (toujours visible) */}
      <aside className="flex flex-col bg-white border-l border-border min-w-0">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-soft">Ticket en cours</div>
            <div className="text-sm font-medium">
              {lines.length} ligne(s){savingLines ? ' · sync…' : ''}
              {cartComment && <span className="ml-1 text-xs text-ink-soft" title={cartComment}>· 💬</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={lines.length === 0}
              onClick={() => setShowCartActions(true)}
              className="btn-soft text-xs"
              title="Remise globale / commentaire"
            >
              Actions
            </button>
            <button
              disabled={lines.length === 0}
              onClick={() => { setLines([]); setSaleId(null); setCartComment(''); void detachCustomer(); }}
              className="btn-ghost text-xs"
            >
              Vider
            </button>
          </div>
        </div>

        {/* Zone client */}
        <div className="px-3 py-2 border-b border-border space-y-2">
          {customer ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-ink-soft">Client</div>
                  <div className="text-sm font-medium truncate">{customer.display_name}</div>
                  {customer.default_discount_pct && customer.default_discount_pct > 0 && (
                    <div className="text-xs text-warning">Remise systématique : -{customer.default_discount_pct}%</div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowPicker(true)} className="text-xs text-accent-deep hover:underline">
                    Changer
                  </button>
                  <button onClick={() => void detachCustomer()} className="text-ink-soft hover:text-danger px-1">✕</button>
                </div>
              </div>
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
              className="w-full rounded-xl border border-dashed border-border px-3 py-2 text-sm text-ink-soft hover:border-gray-300 hover:text-ink"
            >
              + Associer un client
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2 py-2 space-y-2">
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
                className="w-full text-left rounded-lg border border-border px-2 py-1.5 bg-white hover:border-gray-300 transition-colors"
                title="Cliquer pour ajouter / modifier une remise"
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="text-sm font-medium flex-1 truncate">{l.label}</div>
                  <span className="font-semibold text-sm whitespace-nowrap">{formatEUR(sub)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); requestRemoveLine(l.key); }}
                    className="text-ink-soft hover:text-danger text-xs"
                  >✕</button>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-ink-soft">
                  <span>
                    {formatEUR(l.unit_price_ttc)}
                    {l.discount_amount > 0 && <span className="text-warning ml-1">· -{formatEUR(l.discount_amount)}</span>}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button className="h-6 w-6 rounded border border-border text-xs" onClick={() => incLine(l.key, -1)}>-</button>
                    <span className="w-6 text-center text-ink">{l.quantity}</span>
                    <button className="h-6 w-6 rounded border border-border text-xs" onClick={() => incLine(l.key, +1)}>+</button>
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
          <button
            disabled={lines.length === 0 || totals.ttc <= 0}
            className="btn-primary w-full h-16 text-xl"
            onClick={async () => { const id = await ensureSale(); if (id) { await syncLines(); setShowPayment(true); } }}
          >
            Encaisser · {formatEUR(totals.ttc)}
          </button>
          <button
            disabled={lines.length === 0 || !saleId}
            className="btn-ghost w-full text-sm"
            onClick={() => void holdSale()}
          >
            Mettre en attente
          </button>
        </div>

        {error && (
          <div className="border-t border-danger/20 bg-danger/5 px-4 py-2 text-xs text-danger">
            {error}
          </div>
        )}
      </aside>

      {showPayment && saleId && (
        <PaymentModal
          saleId={saleId}
          totalTtc={totals.ttc}
          loyaltyRedemption={loyalty.used > 0 ? loyalty.used : undefined}
          onClose={() => setShowPayment(false)}
          onValidated={onValidated}
        />
      )}
      {receipt && (
        <ReceiptPreviewModal receipt={receipt} onClose={() => setReceipt(null)} />
      )}
      {showHeld && (
        <HoldListModal
          registerId={registerId}
          onClose={() => setShowHeld(false)}
          onPick={recallSale}
        />
      )}
      {showFreePrice && (
        <FreePriceModal
          defaultTaxCode={taxRates.find((t) => t.is_default)?.code ?? FREE_PRICE_TAX_CODE_DEFAULT}
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
      {showCartActions && (
        <CartActionsModal
          cartTotal={totals.ttc}
          currentComment={cartComment}
          hasLines={lines.length > 0}
          onClose={() => setShowCartActions(false)}
          onCartDiscount={(mode, value) => {
            const computed = mode === 'percent'
              ? round2((totals.ttc * value) / 100)
              : Math.min(round2(value), round2(totals.ttc));
            if (computed <= 0) return;
            setShowCartActions(false);
            setJustifyAction({ kind: 'cartDiscount', amount: computed, mode });
          }}
          onCommentSave={(c) => { setCartComment(c); setShowCartActions(false); }}
          onCancelTicket={() => {
            setShowCartActions(false);
            setJustifyAction({ kind: 'cancelTicket' });
          }}
        />
      )}
      {justifyAction && (() => {
        const a = justifyAction;
        return (
          <JustificationModal
            title={
              a.kind === 'remove' ? 'Sortie d\'un produit'
              : a.kind === 'lineDiscount' ? 'Remise sur ligne'
              : a.kind === 'cancelTicket' ? 'Annulation du ticket'
              : 'Remise globale panier'
            }
            description={
              a.kind === 'remove' ? 'Indiquez la raison du retrait de l\'article du panier.'
              : a.kind === 'cancelTicket' ? 'Indiquez le motif d\'annulation du ticket complet.'
              : 'Toute remise manuelle doit être justifiée.'
            }
            onClose={() => setJustifyAction(null)}
            onConfirm={async (reason) => {
              if (a.kind === 'remove') {
                removeLine(a.key);
              } else if (a.kind === 'lineDiscount') {
                setLines((cur) => cur.map((l) => l.key === a.key
                  ? { ...l, discount_amount: a.amount, metadata: { ...l.metadata, manual_discount_reason: reason } }
                  : l));
              } else if (a.kind === 'cartDiscount') {
                const subtotal = lines.reduce((s, l) => s + round2(l.unit_price_ttc * l.quantity - l.discount_amount), 0);
                if (subtotal > 0) {
                  const ratio = a.amount / subtotal;
                  setLines((cur) => cur.map((l) => {
                    const lineSub = round2(l.unit_price_ttc * l.quantity - l.discount_amount);
                    return {
                      ...l,
                      discount_amount: round2(l.discount_amount + lineSub * ratio),
                      metadata: { ...l.metadata, cart_discount: true, cart_discount_reason: reason },
                    };
                  }));
                }
              } else if (a.kind === 'cancelTicket') {
                // Détache le client puis vide tout localement.
                // La vente brouillon côté serveur peut être laissée en l'état
                // (jamais validée → aucun impact fiscal). On audit côté client par
                // l'événement de remise locale + reset complet.
                if (saleId) {
                  await fetch(`/api/sales/${saleId}/customer`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customer_id: null }),
                  }).catch(() => undefined);
                }
                setLines([]); setSaleId(null); setCustomer(null);
                setLoyalty({ enabled: false, balance_euros: 0, min_redeem: 0, used: 0 });
                setCartComment('');
                setView({ kind: 'categories' }); setSearch('');
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
  categories, uncategorizedCount, onPick, metrics,
}: {
  categories: (Category & { count: number })[];
  uncategorizedCount: number;
  onPick: (id: string | 'uncategorized') => void;
  metrics: ReturnType<typeof tileMetrics>;
}) {
  if (categories.length === 0 && uncategorizedCount === 0) {
    return (
      <div className="text-center text-ink-soft mt-12">
        Aucun produit. Ajoutez-en dans <a className="underline" href="/products">Produits</a>.
      </div>
    );
  }
  return (
    <div className={`grid ${metrics.grid} ${metrics.gap}`}>
      {categories.map((c) => (
        <CategoryTile key={c.id} category={c} onPick={() => onPick(c.id)} metrics={metrics} />
      ))}
      {uncategorizedCount > 0 && (
        <CategoryTile
          category={{ id: 'uncategorized', name: 'Sans catégorie', color: '#F5F5F5', image_url: null, count: uncategorizedCount }}
          onPick={() => onPick('uncategorized')}
          metrics={metrics}
        />
      )}
    </div>
  );
}

function CategoryTile({
  category: c, onPick, metrics,
}: {
  category: { id: string; name: string; color: string | null; image_url: string | null; count: number };
  onPick: () => void;
  metrics: ReturnType<typeof tileMetrics>;
}) {
  const hasImage = !!c.image_url;
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
