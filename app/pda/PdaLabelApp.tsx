'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { formatEUR } from '@/lib/services/money';
import { useBrand } from '@/components/BrandMark';
import ProductFormModal from '@/app/(app)/products/ProductFormModal';
import {
  buildLabelsDocument, openPrintWindow, discountedPrice, type LabelProduct,
} from '@/lib/services/label-print';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';

interface Product extends LabelProduct {
  id: string;
  image_url?: string | null;
  category_name?: string | null;
  /** Enregistrement brut (API) pour l'édition (tous les champs). */
  raw?: Record<string, unknown>;
}
/** Type accepté par ProductFormModal (structurel). */
type EditableProduct = {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null; sale_price_ttc: number;
  price_is_free: boolean; purchase_price_ht?: number | null; transport_cost_ht?: number | null;
  tax_rate_id: string; category_id: string | null; supplier_id?: string | null;
  discount_type?: 'percent' | 'amount' | null; discount_value?: number | null;
  visible_in_pos: boolean; is_active: boolean; is_seasonal: boolean; is_customizable: boolean;
  is_top_product?: boolean; no_discount?: boolean; color?: string | null;
  image_url?: string | null; store_ids?: string[];
};
function toEditable(r: Record<string, unknown>): EditableProduct {
  const num = (v: unknown) => (v != null ? Number(v) : null);
  return {
    id: String(r.id), name: String(r.name),
    short_description: (r.short_description as string) ?? null,
    sku: (r.sku as string) ?? null, barcode: (r.barcode as string) ?? null,
    sale_price_ttc: Number(r.sale_price_ttc), price_is_free: !!r.price_is_free,
    purchase_price_ht: num(r.purchase_price_ht), transport_cost_ht: num(r.transport_cost_ht),
    tax_rate_id: String(r.tax_rate_id ?? ''), category_id: (r.category_id as string) ?? null,
    supplier_id: (r.supplier_id as string) ?? null,
    discount_type: (r.discount_type as 'percent' | 'amount' | null) ?? null,
    discount_value: num(r.discount_value),
    visible_in_pos: r.visible_in_pos !== false, is_active: r.is_active !== false,
    is_seasonal: !!r.is_seasonal, is_customizable: !!r.is_customizable,
    is_top_product: !!r.is_top_product, no_discount: !!r.no_discount,
    color: (r.color as string) ?? null, image_url: (r.image_url as string) ?? null,
    store_ids: (r.store_ids as string[]) ?? [],
  };
}
interface Station { id: string; store_id: string; store_name: string; name: string }
interface TaxRate { id: string; code: string; rate: number; label: string; is_default: boolean }
interface RecentAction { kind: 'label' | 'stock' | 'create'; title: string; sub: string; at: string }

export default function PdaLabelApp({ userName, canWrite }: { userName: string; canWrite: boolean }) {
  const rawBrand = useBrand();
  // Logo spécifique PDA si configuré, sinon logo principal.
  const brand = { ...rawBrand, logo_url: rawBrand.pda_logo_url || rawBrand.logo_url };
  const [station, setStation] = useState<Station | null | undefined>(undefined);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  const [settings, setSettings] = useState<LabelSettings>(LABEL_DEFAULTS);
  const [cloudPrinter, setCloudPrinter] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [qtyStr, setQtyStr] = useState('');
  const qty = Math.min(200, Math.max(0, parseInt(qtyStr || '0', 10) || 0));
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [createFor, setCreateFor] = useState<string | null>(null); // barcode prérempli ('' = vide)
  const [editing, setEditing] = useState<EditableProduct | null>(null); // édition article
  const [pending, setPending] = useState<Product | null>(null); // choix étiquette / stock
  const [stockFor, setStockFor] = useState<Product | null>(null); // entrée de stock
  const [stockQtyStr, setStockQtyStr] = useState('');
  const [stockLevel, setStockLevel] = useState<number | null>(null);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const [stockSending, setStockSending] = useState(false);
  const [lastStockQty, setLastStockQty] = useState(0); // qté de la dernière entrée validée
  const photoRef = useRef<HTMLInputElement>(null);
  // Tableau de bord : onglet actif + mode de scan « armé » + activité récente.
  const [homeTab, setHomeTab] = useState<'home' | 'articles' | 'history' | 'settings'>('home');
  const [scanPrompt, setScanPrompt] = useState<null | 'choice' | 'label' | 'stock'>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentAction[]>([]);

  // Activité récente (persistée sur l'appareil).
  useEffect(() => {
    try {
      const s = localStorage.getItem('webpos_pda_recent');
      if (s) setRecent(JSON.parse(s) as RecentAction[]);
    } catch { /* ignore */ }
  }, []);
  function addRecent(kind: RecentAction['kind'], title: string, sub: string) {
    let hh = '';
    try { hh = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { /* ignore */ }
    setRecent((cur) => {
      const next = [{ kind, title, sub, at: hh }, ...cur].slice(0, 30);
      try { localStorage.setItem('webpos_pda_recent', JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }

  // ---- Résolution de la station (PDA ↔ boutique), définie à l'appairage ----
  // Pas d'écran de choix de boutique : la boutique vient de l'appairage
  // (code / QR). Si l'appareil n'a pas de station, on la reconstitue depuis
  // la boutique de l'utilisateur de service (appairé) et on la rattache.
  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      const r = await fetch(`/api/label-stations/mine?device_id=${encodeURIComponent(deviceId)}`);
      let st = r.ok ? ((await r.json()).station as Station | null) : null;
      if (!st) {
        const me = await fetch('/api/me');
        const accessible = me.ok ? (((await me.json()).stores ?? []) as { id: string; name: string }[]) : [];
        if (accessible.length >= 1) {
          const store = accessible[0]!;
          await fetch('/api/label-stations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, store_id: store.id }),
          });
          st = { id: '', store_id: store.id, store_name: store.name, name: `PDA ${store.name}` };
        }
      }
      setStation(st ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Chargement catalogue (boutique du PDA) + réglages étiquettes ----
  async function reloadProducts(storeId: string) {
    const r = await fetch(`/api/products?active=true&store_id=${encodeURIComponent(storeId)}`);
    if (r.ok) {
      const j = await r.json();
      setProducts((j.products as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        name: String(p.name),
        sku: (p.sku as string) ?? null,
        barcode: (p.barcode as string) ?? null,
        sale_price_ttc: Number(p.sale_price_ttc),
        discount_type: (p.discount_type as 'percent' | 'amount' | null) ?? null,
        discount_value: p.discount_value != null ? Number(p.discount_value) : null,
        image_url: (p.image_url as string) ?? null,
        category_name: (p.category_name as string) ?? null,
        raw: p,
      })));
    }
  }
  useEffect(() => {
    if (!station) return;
    setLoading(true);
    void (async () => {
      const [, s, rc, tx] = await Promise.all([
        reloadProducts(station.store_id),
        fetch('/api/settings/labels'),
        fetch('/api/cloudprnt/printers'),
        fetch('/api/tax-rates'),
      ]);
      if (s.ok) setSettings((await s.json()).settings as LabelSettings);
      if (rc.ok) {
        const printers = (await rc.json()).printers as Array<{ label: string; role: string; enabled: boolean }>;
        const p = printers.find((x) => x.role === 'label' && x.enabled);
        setCloudPrinter(p ? p.label : null);
      }
      if (tx.ok) setTaxRates(((await tx.json()).tax_rates as TaxRate[]).map((t) => ({ ...t, rate: Number(t.rate) })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station]);

  // Scan GLOBAL : le lecteur du PDA « tape » le code + Entrée, où qu'on soit
  // dans l'app (sans focus sur un champ, sans tuile ni menu). On tamponne les
  // frappes rapides ; sur Entrée, on traite le code (→ « Scanner un article »).
  const scanFnRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    scanFnRef.current = (code: string) => {
      // On ignore uniquement si on est dans un plein écran (éditeur, stock,
      // création, édition) ou une modale de choix. Un scan fonctionne donc sur
      // l'ACCUEIL comme sur l'invite de scan (Imprimer étiquette / Entrer stock).
      if (selected || createFor !== null || editing || stockFor || pending) return;
      const mode = scanPrompt ?? 'choice';
      // Sur l'accueil (aucune invite ouverte), un scan ouvre la page
      // « Scanner un article » puis traite le code.
      if (!scanPrompt) setScanPrompt('choice');
      handleCode(code, mode);
    };
  });
  useEffect(() => {
    let buf = '';
    let last = 0;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      // Champ de saisie actif (recherche, formulaire, caméra) : on laisse faire.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.key === 'Enter') {
        if (buf.length >= 3) scanFnRef.current(buf);
        buf = '';
        return;
      }
      if (e.key.length === 1) {
        const now = Date.now();
        if (now - last > 300) buf = '';   // pause = nouvelle séquence
        last = now;
        buf += e.key;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.barcode?.toLowerCase().includes(s) ?? false),
    );
  }, [products, q]);

  // Traite un code (scan matériel via Entrée, ou caméra). `mode` = action
  // « armée » (via une carte du tableau de bord) : label / stock / choice.
  function handleCode(raw: string, mode: 'choice' | 'label' | 'stock' = 'choice') {
    const s = raw.trim();
    if (!s) return;
    const exact = products.find((p) => p.barcode === s || p.sku === s || p.barcode === s.toUpperCase());
    const hit = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (hit) {
      // Étiquette / stock ouvrent un plein écran → on ferme l'invite de scan.
      // En mode « choix », l'invite reste ouverte derrière la modale de choix
      // (permet d'enchaîner les scans sans revenir en arrière).
      if (mode !== 'choice') setScanPrompt(null);
      routeProduct(hit, mode);
      return;
    }
    setScanPrompt(null);
    if (canWrite) setCreateFor(s);
    else setMsg('Article introuvable pour ce code.');
  }
  function routeProduct(p: Product, mode: 'choice' | 'label' | 'stock') {
    if (mode === 'label') openProduct(p);
    else if (mode === 'stock') void startStock(p);
    else pickProduct(p);
  }

  // Après un scan / tap : demande QUOI FAIRE (étiquette ou stock).
  function pickProduct(p: Product) { setPending(p); setQ(''); setMsg(null); }
  function openProduct(p: Product) { setSelected(p); setQtyStr(''); setQ(''); setMsg(null); }
  function backToList() { setSelected(null); setMsg(null); }

  // Navigation basse partagée : rendue sur le tableau de bord, l'éditeur ET
  // les invites de scan. Un onglet ferme l'invite/l'éditeur et revient au tab.
  const goTab = (t: 'home' | 'articles' | 'history' | 'settings') => {
    setScanPrompt(null); setSelected(null); setMsg(null); setHomeTab(t);
  };
  const renderBottomNav = () => (
    <nav className="shrink-0 border-t border-border bg-surface grid grid-cols-5 items-end px-2 pt-1 pb-1 relative z-30 overflow-visible">
      <NavItem active={!selected && !scanPrompt && homeTab === 'home'} label="Accueil" icon={<IconHome />} onClick={() => goTab('home')} />
      <NavItem active={!selected && !scanPrompt && homeTab === 'history'} label="Historique" icon={<IconClock />} onClick={() => goTab('history')} />
      <div className="grid place-items-center">
        <button onClick={() => setScanPrompt('choice')}
                className="h-14 w-14 -mt-5 rounded-full accent-bar text-white grid place-items-center shadow-lg relative z-10">
          <IconBarcode />
        </button>
        <span className="text-[10px] mt-0.5 text-ink-soft">Scanner</span>
      </div>
      <NavItem active={!selected && !scanPrompt && homeTab === 'articles'} label="Articles" icon={<IconBox />} onClick={() => goTab('articles')} />
      <NavItem active={!selected && !scanPrompt && homeTab === 'settings'} label="Paramètres" icon={<IconGear />} onClick={() => goTab('settings')} />
    </nav>
  );

  // ---- Entrée de stock ----
  async function startStock(p: Product) {
    setStockFor(p); setStockQtyStr(''); setStockLevel(null); setStockMsg(null); setLastStockQty(0);
    if (!station) return;
    try {
      const r = await fetch(`/api/stock/levels?store_id=${encodeURIComponent(station.store_id)}`);
      if (r.ok) {
        const lv = ((await r.json()).levels as Array<{ product_id: string; quantity: string }>)
          .find((x) => x.product_id === p.id);
        setStockLevel(lv ? Number(lv.quantity) : 0);
      }
    } catch { /* niveau inconnu */ }
  }
  function pressStockQty(k: string) {
    setStockQtyStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      return next.length > 4 ? cur : next;
    });
  }
  async function validateStock() {
    if (!stockFor || !station) return;
    const qty = parseInt(stockQtyStr || '0', 10) || 0;
    if (qty < 1) return;
    setStockSending(true); setStockMsg(null);
    const r = await fetch('/api/stock/movement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: station.store_id, product_id: stockFor.id,
        movement_type: 'purchase', quantity_delta: qty, reason: 'Entrée PDA (scan)',
      }),
    });
    setStockSending(false);
    if (r.ok) {
      setStockLevel((cur) => (cur ?? 0) + qty);
      setStockMsg(`✅ +${qty} en stock (total : ${(stockLevel ?? 0) + qty}).`);
      setLastStockQty(qty);
      setStockQtyStr('');
      addRecent('stock', 'Stock entré', `${stockFor.name} · +${qty}`);
    } else {
      const j = await r.json().catch(() => null);
      setStockMsg(j?.error === 'FORBIDDEN' ? "Droits insuffisants pour ajuster le stock." : "❌ Échec de l'entrée de stock.");
    }
  }

  function pressQty(k: string) {
    setQtyStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      if (next.length > 3) return cur;
      return Number(next) > 200 ? '200' : next;
    });
  }

  // Impression générique de N étiquettes d'un produit. Retourne un message.
  async function printLabelsFor(product: Product, count: number): Promise<string> {
    if (count < 1) return '';
    if (cloudPrinter) {
      const r = await fetch('/api/cloudprnt/print-labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ product, qty: count }], store_id: station?.store_id ?? null }),
      });
      if (r.ok) { const j = await r.json(); return `✅ ${j.count} étiquette(s) envoyée(s) à « ${j.printer} ».`; }
      return '❌ Échec de l’envoi à l’imprimante.';
    }
    const doc = buildLabelsDocument([{ product, qty: count }], settings);
    return openPrintWindow(doc) ? '' : 'Autorisez les fenêtres pop-up pour imprimer.';
  }

  async function print() {
    if (!selected || qty < 1) return;
    setMsg(null); setSending(true);
    const m = await printLabelsFor(selected, qty);
    setSending(false);
    if (m) setMsg(m);
    if (!m.startsWith('❌')) addRecent('label', 'Étiquette imprimée', `${selected.name} · ${qty}`);
  }

  // Impression des étiquettes correspondant à l'entrée de stock qui vient
  // d'être validée (N articles entrés → N étiquettes).
  async function printStockLabels() {
    if (!stockFor || lastStockQty < 1) return;
    setStockSending(true);
    const m = await printLabelsFor(stockFor, lastStockQty);
    setStockSending(false);
    setStockMsg(m || `🖨 ${lastStockQty} étiquette(s) lancée(s) à l'impression.`);
  }

  // ---- Photo : capture + compression + enregistrement sur l'article ----
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    setPhotoBusy(true); setMsg(null);
    try {
      const dataUrl = await compressImage(file, 900, 0.7);
      const r = await fetch(`/api/products/${selected.id}/photo`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: dataUrl }),
      });
      if (r.ok) {
        setSelected((cur) => (cur ? { ...cur, image_url: dataUrl } : cur));
        setProducts((cur) => cur.map((p) => (p.id === selected.id ? { ...p, image_url: dataUrl } : p)));
        setMsg('📷 Photo enregistrée.');
      } else setMsg('❌ Échec de l’enregistrement de la photo.');
    } catch { setMsg('❌ Photo illisible.'); }
    setPhotoBusy(false);
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    // App dédiée : on revient à l'écran d'appairage du PDA, jamais à la caisse.
    window.location.assign('/pda');
  }

  // ---- Appareil non appairé (aucune boutique résolue) : ré-appairage ----
  // (Pas d'écran de choix de boutique : la boutique vient de l'appairage.)
  if (station === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg p-6 pt-safe pb-safe pl-safe pr-safe">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrandLogo brand={brand} />
          </div>
          <h1 className="text-lg font-semibold">PDA non appairé</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Cet appareil n&apos;est rattaché à aucune boutique. Ré-appairez-le avec le
            code (ou le QR) généré en back-office.
          </p>
          <button onClick={() => void logout()} className="btn-primary w-full h-12 mt-4">
            Appairer ce PDA
          </button>
        </div>
      </div>
    );
  }
  if (station === undefined) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink-soft">Chargement…</div>;
  }

  const disc = selected && settings.show_discount ? discountedPrice(selected) : null;

  // ---- Création d'article : PLEINE PAGE (pas de modale) ----
  if (createFor !== null) {
    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <button onClick={() => setCreateFor(null)} className="text-sm text-accent-deep hover:underline">← Retour</button>
          <div className="flex-1 text-center font-semibold">Nouvel article</div>
          <div className="w-16" />
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ProductFormModal
            inline
            product={null}
            taxRates={taxRates}
            categories={[]}
            backOffice={false}
            prefillBarcode={createFor || undefined}
            posteStoreOverride={station.store_id}
            onClose={() => setCreateFor(null)}
            onSaved={async () => { setCreateFor(null); addRecent('create', 'Nouvel article créé', ''); await reloadProducts(station.store_id); }}
          />
        </div>
      </div>
    );
  }

  // ---- Édition d'article : PLEINE PAGE ----
  if (editing) {
    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <button onClick={() => setEditing(null)} className="text-sm text-accent-deep hover:underline">← Retour</button>
          <div className="flex-1 text-center font-semibold">Modifier l&apos;article</div>
          <div className="w-16" />
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ProductFormModal
            inline
            product={editing}
            taxRates={taxRates}
            categories={[]}
            backOffice={false}
            posteStoreOverride={station.store_id}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await reloadProducts(station.store_id);
              // Rafraîchit la fiche ouverte avec les nouvelles données.
              if (selected) {
                const r = await fetch(`/api/products?active=true&store_id=${encodeURIComponent(station.store_id)}`);
                if (r.ok) {
                  const p = ((await r.json()).products as Array<Record<string, unknown>>).find((x) => String(x.id) === selected.id);
                  if (p) setSelected({
                    id: selected.id, name: String(p.name), sku: (p.sku as string) ?? null,
                    barcode: (p.barcode as string) ?? null, sale_price_ttc: Number(p.sale_price_ttc),
                    discount_type: (p.discount_type as 'percent' | 'amount' | null) ?? null,
                    discount_value: p.discount_value != null ? Number(p.discount_value) : null,
                    image_url: (p.image_url as string) ?? null, category_name: (p.category_name as string) ?? null,
                    raw: p,
                  });
                }
              }
            }}
          />
        </div>
      </div>
    );
  }

  // ---- Entrée de stock : PLEINE PAGE ----
  if (stockFor) {
    const sQty = parseInt(stockQtyStr || '0', 10) || 0;
    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <button onClick={() => { setStockFor(null); setStockMsg(null); }} className="text-sm text-accent-deep hover:underline">← Retour</button>
          <div className="flex-1 text-center font-semibold">Entrée de stock</div>
          <div className="w-16" />
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
          <div className="font-semibold text-lg leading-tight">{stockFor.name}</div>
          <div className="text-sm text-ink-soft">
            {stockFor.barcode ?? 'pas de code-barres'} · Stock actuel :{' '}
            <span className="font-semibold text-ink">{stockLevel == null ? '…' : stockLevel}</span>
          </div>
          <div className="mt-4 text-xs text-ink-soft">Quantité à ajouter</div>
          <div className="mt-1 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
            {stockQtyStr === '' ? <span className="text-ink-soft/40">0</span> : `+${stockQtyStr}`}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
              <button key={k} onClick={() => pressStockQty(k)}
                className={`h-14 rounded-xl text-xl font-semibold ${
                  k === 'C' ? 'bg-danger/10 text-danger'
                  : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                  : 'bg-gray-50 border border-border'}`}>{k}</button>
            ))}
          </div>
          {stockMsg && <p className="mt-3 text-sm text-center">{stockMsg}</p>}
          <button onClick={() => void validateStock()} disabled={sQty < 1 || stockSending}
                  className="btn-primary h-14 mt-4 text-base">
            {stockSending ? '…' : sQty > 0 ? `Valider l'entrée (+${sQty})` : "Valider l'entrée de stock"}
          </button>
          {/* Après validation : imprimer autant d'étiquettes que d'articles entrés. */}
          {lastStockQty > 0 && (
            <button onClick={() => void printStockLabels()} disabled={stockSending}
                    className="btn-soft h-14 mt-2 text-base">
              🖨 Imprimer {lastStockQty} étiquette{lastStockQty > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Barre d'en-tête : logo (comme à l'origine), sans titre.
          Hauteur = 3,5rem + encoche iOS (PWA plein écran), sinon le logo passe
          derrière la barre de statut. minHeight en inline (indépendant de la
          disponibilité de la classe min-h-14). */}
      <header
        className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <BrandLogo brand={brand} />
        <div className="flex-1" />
        {/* PDA appairé en permanence : pas de bouton Quitter. */}
        <span className="text-xs text-ink-soft truncate max-w-[45%]">{userName}</span>
      </header>

      {selected ? (
        <>
          {/* ===== ÉDITEUR D'ÉTIQUETTE ===== */}
          <section className="h-[46%] shrink-0 border-b-2 border-border bg-surface overflow-y-auto">
            <div className="h-full p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold leading-tight line-clamp-2">{selected.name}</div>
                  <div className="text-sm text-ink-soft">
                    {disc != null && <span className="line-through mr-1">{formatEUR(selected.sale_price_ttc)}</span>}
                    <span className="font-semibold text-ink">{formatEUR(disc ?? selected.sale_price_ttc)}</span>
                    {selected.barcode ? ` · ${selected.barcode}` : ' · pas de code-barres'}
                  </div>
                </div>
                <button onClick={backToList} className="text-ink-soft hover:text-ink text-xl leading-none shrink-0">✕</button>
              </div>
              <div className="mt-2 flex-1 min-h-0 grid grid-cols-[1fr_auto] gap-3">
                <div className="flex flex-col min-h-0">
                  <div className="text-xs text-ink-soft">Nombre d&apos;étiquettes</div>
                  <div className="mt-1 rounded-xl border border-border h-12 px-4 flex items-center justify-end text-2xl font-semibold tabular-nums bg-white">
                    {qtyStr === '' ? <span className="text-ink-soft/40">0</span> : qtyStr}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 flex-1 min-h-0">
                    {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
                      <button key={k} onClick={() => pressQty(k)}
                        className={`rounded-lg text-lg font-semibold min-h-[40px] ${
                          k === 'C' ? 'bg-danger/10 text-danger'
                          : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                          : 'bg-gray-50 border border-border'}`}>{k}</button>
                    ))}
                  </div>
                </div>
                <div className="w-32 flex flex-col gap-2">
                  <button onClick={() => void print()} disabled={qty < 1 || sending}
                          className="btn-primary flex-1 flex-col gap-1 text-sm">
                    <span className="text-2xl">🖨</span>
                    <span>{sending ? '…' : 'Imprimer'}</span>
                  </button>
                  {canWrite && (
                    <button onClick={() => photoRef.current?.click()} disabled={photoBusy}
                            className="btn-soft flex-1 flex-col gap-1 text-sm">
                      <span className="text-2xl">📷</span>
                      <span>{photoBusy ? '…' : 'Photo'}</span>
                    </button>
                  )}
                </div>
              </div>
              {msg && <p className="mt-1 text-sm text-center">{msg}</p>}
            </div>
          </section>
          {/* ===== FICHE ARTICLE ===== */}
          <section className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <div className="flex items-center justify-between">
                <button onClick={backToList} className="text-sm text-accent-deep hover:underline">← Retour</button>
                <button onClick={() => selected.raw && setEditing(toEditable(selected.raw))}
                        className="btn-soft h-9 px-3 text-sm">✎ Éditer l&apos;article</button>
              </div>
              <button onClick={() => selected.raw && setEditing(toEditable(selected.raw))}
                      className="mt-3 w-full text-left flex gap-4 rounded-xl p-1 -m-1 active:bg-gray-100">
                <div className="h-28 w-28 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {selected.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.image_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-lg font-semibold leading-tight">{selected.name}</div>
                  <div className="text-2xl font-bold">{formatEUR(disc ?? selected.sale_price_ttc)}</div>
                  <dl className="text-sm text-ink-soft space-y-0.5">
                    <div>Code-barres : <span className="font-mono text-ink">{selected.barcode ?? '—'}</span></div>
                    {selected.sku && <div>SKU : <span className="font-mono text-ink">{selected.sku}</span></div>}
                    {selected.category_name && <div>Catégorie : <span className="text-ink">{selected.category_name}</span></div>}
                  </dl>
                  <div className="text-xs text-accent-deep pt-1">Appuyer pour modifier →</div>
                </div>
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* ===== TABLEAU DE BORD ===== */}
          <main className="flex-1 min-h-0 overflow-y-auto">
            {homeTab === 'home' && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ActionCard tone="rose" title="Imprimer une étiquette"
                    desc="Scannez un code-barres pour imprimer l'étiquette du produit."
                    icon={<IconPrinter />} onClick={() => setScanPrompt('label')} />
                  {canWrite && (
                    <ActionCard tone="green" title="Entrer en stock"
                      desc="Scannez un code-barres pour entrer la marchandise en stock."
                      icon={<IconBoxDown />} onClick={() => setScanPrompt('stock')} />
                  )}
                  {canWrite && (
                    <ActionCard tone="blue" title="Créer un nouvel article"
                      desc="Créez un nouvel article dans le catalogue."
                      icon={<IconBoxPlus />} onClick={() => setCreateFor('')} />
                  )}
                </div>

                <div>
                  <div className="font-semibold mb-2">Dernières actions</div>
                  <div className="card divide-y divide-border">
                    {recent.length === 0 ? (
                      <div className="p-4 text-sm text-ink-soft">Aucune action récente.</div>
                    ) : recent.slice(0, 3).map((r, i) => <RecentRow key={i} r={r} />)}
                    {recent.length > 3 && (
                      <button onClick={() => setHomeTab('history')} className="w-full p-3 text-sm font-semibold text-accent-deep">
                        Voir tout l&apos;historique
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {homeTab === 'articles' && (
              <div className="flex flex-col">
                <div className="p-3 border-b border-border bg-surface sticky top-0">
                  <input className="input h-11 w-full" placeholder="Rechercher un article…"
                         value={q} onChange={(e) => setQ(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCode(q, 'choice'); } }} />
                </div>
                {loading ? (
                  <div className="p-6 text-sm text-ink-soft">Chargement…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-sm text-ink-soft">Aucun article.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <button onClick={() => pickProduct(p)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 active:bg-gray-100">
                          {p.image_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover shrink-0 bg-gray-100" />
                            : <span className="h-10 w-10 rounded bg-gray-100 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{p.name}</div>
                            <div className="text-xs text-ink-soft truncate">{p.barcode ?? '— pas de code-barres —'}</div>
                          </div>
                          <div className="font-semibold tabular-nums whitespace-nowrap">{formatEUR(p.sale_price_ttc)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {homeTab === 'history' && (
              <div className="p-4">
                <div className="font-semibold mb-2">Historique</div>
                {recent.length === 0 ? (
                  <div className="card p-4 text-sm text-ink-soft">Aucune action récente.</div>
                ) : (
                  <div className="card divide-y divide-border">
                    {recent.map((r, i) => <RecentRow key={i} r={r} />)}
                  </div>
                )}
              </div>
            )}

            {homeTab === 'settings' && (
              <div className="p-4 space-y-3">
                <div className="font-semibold">Paramètres</div>
                <div className="card p-4 text-sm space-y-1">
                  <div>Boutique : <strong>{station.store_name}</strong></div>
                  <div className="text-ink-soft">Utilisateur : {userName}</div>
                </div>
                <button onClick={() => void logout()} className="btn-soft w-full h-11 text-danger">Ré-appairer ce PDA</button>
              </div>
            )}
          </main>
        </>
      )}

      {/* ===== BARRE DE NAVIGATION — toujours visible, au premier plan ===== */}
      {renderBottomNav()}

      {/* ===== Invite de scan (mode armé par une carte) ===== */}
      {scanPrompt && (
        <div className="fixed inset-0 z-[64] flex flex-col bg-bg"
             style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="h-14 flex items-center px-4 border-b border-border">
            <button onClick={() => setScanPrompt(null)} className="text-sm text-accent-deep">← Annuler</button>
            <div className="flex-1 text-center font-semibold">
              {scanPrompt === 'label' ? 'Imprimer une étiquette' : scanPrompt === 'stock' ? 'Entrer en stock' : 'Scan rapide'}
            </div>
            <div className="w-16" />
          </div>
          <div className="flex-1 grid place-items-center p-6 text-center">
            <div>
              <div className="text-rose-500 mx-auto w-16 h-16 grid place-items-center"><IconBarcode big /></div>
              <p className="mt-4 text-lg font-semibold">Scannez un article</p>
              <p className="mt-1 text-sm text-ink-soft">Avec le lecteur du PDA. Touchez le champ pour saisir à la main.</p>
              <input
                ref={promptRef} className="input h-12 mt-4 text-center text-lg w-64 max-w-full"
                placeholder="Code-barres…" autoComplete="off"
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ''; handleCode(v, scanPrompt); } }}
              />
            </div>
          </div>
          {/* Barre de menu visible aussi sur l'invite de scan */}
          {renderBottomNav()}
        </div>
      )}

      {/* Choix après un scan : étiquette ou entrée de stock */}
      {pending && (
        <div className="fixed inset-0 z-[65] grid place-items-center bg-ink/40 backdrop-blur-sm p-6"
             onClick={() => setPending(null)}>
          <div className="card w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold leading-tight">{pending.name}</div>
            <div className="text-sm text-ink-soft">{pending.barcode ?? 'pas de code-barres'}</div>
            <div className="mt-4 text-sm text-ink-soft">Que faire ?</div>
            <button
              onClick={() => { const p = pending; setPending(null); openProduct(p); }}
              className="btn-primary w-full h-14 mt-2 text-base">
              🖨 Imprimer une étiquette
            </button>
            {canWrite && (
              <button
                onClick={() => { const p = pending; setPending(null); void startStock(p); }}
                className="btn-soft w-full h-14 mt-2 text-base">
                📦 Ajouter au stock
              </button>
            )}
            <button onClick={() => setPending(null)} className="mt-3 text-sm text-ink-soft hover:text-ink">Annuler</button>
          </div>
        </div>
      )}

      {/* Input photo caché (capture appareil) */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e)} />
    </div>
  );
}

function BrandLogo({ brand, small }: { brand: { logo_url: string; brand_name: string }; small?: boolean }) {
  const cls = small ? 'h-8 w-auto max-w-[120px]' : 'h-9 w-auto max-w-[150px]';
  return brand.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo_url} alt={brand.brand_name} className={`${cls} object-contain`} />
  ) : (
    <span className={`grid ${small ? 'h-8 w-8' : 'h-9 w-9'} place-items-center rounded-xl accent-bar text-white font-semibold`}>
      {(brand.brand_name || 'H').charAt(0)}
    </span>
  );
}

/** Réduit une image (fichier) en data URL JPEG compressée. */
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}

// ---- Tableau de bord : briques UI ----
function ActionCard({ tone, title, desc, icon, onClick }: {
  tone: 'rose' | 'green' | 'blue'; title: string; desc: string;
  icon: React.ReactNode; onClick: () => void;
}) {
  const bg = tone === 'rose' ? 'bg-rose-50 text-rose-500'
    : tone === 'green' ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
    : 'bg-blue-50 text-blue-500';
  const arrow = tone === 'rose' ? 'text-rose-500' : tone === 'green' ? 'text-[var(--primary)]' : 'text-blue-500';
  return (
    <button onClick={onClick} className="card p-4 text-left flex flex-col active:scale-[0.99] transition-transform min-h-[150px]">
      <div className={`h-12 w-12 rounded-2xl grid place-items-center ${bg}`}>{icon}</div>
      <div className="mt-3 font-semibold leading-tight">{title}</div>
      <div className="mt-1 text-xs text-ink-soft flex-1">{desc}</div>
      <div className={`mt-2 ${arrow}`}>→</div>
    </button>
  );
}

function RecentRow({ r }: { r: RecentAction }) {
  const tone = r.kind === 'label' ? 'bg-rose-50 text-rose-500'
    : r.kind === 'stock' ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
    : 'bg-blue-50 text-blue-500';
  const icon = r.kind === 'label' ? <IconPrinter /> : r.kind === 'stock' ? <IconBoxDown /> : <IconBoxPlus />;
  return (
    <div className="p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{r.title}</div>
        {r.sub && <div className="text-xs text-ink-soft truncate">{r.sub}</div>}
      </div>
      {r.at && <div className="text-xs text-ink-soft tabular-nums">{r.at}</div>}
    </div>
  );
}

function NavItem({ active, label, icon, onClick }: {
  active: boolean; label: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-1 ${active ? 'text-[var(--primary)]' : 'text-ink-soft'}`}>
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

// ---- Icônes (SVG stroke, currentColor) ----
const sv = (d: React.ReactNode, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
function IconPrinter() { return sv(<><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M8 17h8v4H8z" /></>); }
function IconBoxDown() { return sv(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v6" /><path d="M9.5 16.5L12 19l2.5-2.5" /></>); }
function IconBoxPlus() { return sv(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 12v6M9 15h6" /></>); }
function IconBarcode({ big }: { big?: boolean }) { return sv(<path d="M4 6v12M7 6v12M10 6v12M13 6v12M16 6v12M19 6v12" />, big ? 44 : 22); }
function IconHome() { return sv(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>); }
function IconClock() { return sv(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>); }
function IconBox() { return sv(<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>); }
function IconGear() { return sv(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>); }
