'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { useBrand } from '@/components/BrandMark';
import ProductFormModal from '@/app/(app)/products/ProductFormModal';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';
import type { LabelProduct } from '@/lib/services/label-print';
import PdaStock from './PdaStock';
import PdaLabels from './PdaLabels';
import PdaInventory from './PdaInventory';
import PdaDiagnostic from './PdaDiagnostic';
import {
  Screen, Header, MenuCard, Toast,
  IconScanIn, IconTag, IconClipboard, IconGear,
} from './ui';

/* ------------------------------------------------------------------- types */

export interface PdaProduct extends LabelProduct {
  id: string;
  extra_barcodes?: string[] | null;
  category_name?: string | null;
  /** Enregistrement brut de l'API, nécessaire à l'édition. */
  raw?: Record<string, unknown>;
}

interface TaxRate { id: string; code: string; rate: number; label: string; is_default: boolean }

export interface Station {
  id: string;
  store_id: string;
  store_name: string;
  name: string;
}

type EditableProduct = {
  id: string; name: string; short_description: string | null;
  sku: string | null; barcode: string | null; extra_barcodes?: string[] | null;
  sale_price_ttc: number; price_is_free: boolean;
  purchase_price_ht?: number | null; transport_cost_ht?: number | null;
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
    extra_barcodes: (r.extra_barcodes as string[]) ?? [],
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

type ScreenName = 'home' | 'stock' | 'labels' | 'inventory' | 'settings' | 'diagnostic';

/* --------------------------------------------------------------------- app */

/**
 * Coquille de l'application PDA : résolution de la station (boutique appairée),
 * chargement du catalogue et des réglages, puis navigation entre les modules.
 *
 * Le catalogue est chargé UNE fois ici et partagé : chaque module reçoit la
 * même liste et construit son index de codes à partir d'elle. Aucun module ne
 * refait sa propre requête de recherche par code — c'est cette centralisation
 * qui garantit qu'un code donne toujours le même article, partout.
 */
export default function PdaApp({ canWrite, canInventory }: {
  canWrite: boolean;
  canInventory: boolean;
}) {
  const rawBrand = useBrand();
  const brand = { ...rawBrand, logo_url: rawBrand.pda_logo_url || rawBrand.logo_url };

  const [station, setStation] = useState<Station | null | undefined>(undefined);
  const [products, setProducts] = useState<PdaProduct[]>([]);
  const [settings, setSettings] = useState<LabelSettings>(LABEL_DEFAULTS);
  const [cloudPrinter, setCloudPrinter] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<ScreenName>('home');
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  // Article à créer (code inconnu) / à modifier — modales plein écran.
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableProduct | null>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setFlash({ text, tone });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3500);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  /* --- Station : la boutique vient de l'appairage, jamais d'un choix écran --- */
  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      const r = await fetch(`/api/label-stations/mine?device_id=${encodeURIComponent(deviceId)}`);
      let st = r.ok ? ((await r.json()).station as Station | null) : null;
      if (!st) {
        const me = await fetch('/api/me');
        const stores = me.ok ? (((await me.json()).stores ?? []) as Array<{ id: string; name: string }>) : [];
        const store = stores[0];
        if (store) {
          await fetch('/api/label-stations', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, store_id: store.id }),
          });
          st = { id: '', store_id: store.id, store_name: store.name, name: `PDA ${store.name}` };
        }
      }
      setStation(st ?? null);
    })();
  }, []);

  /* --- Catalogue : au niveau ORGANISATION, pour reconnaître tout ce que la
         caisse reconnaît (un filtre par boutique masquait des articles). --- */
  const reloadProducts = useCallback(async () => {
    const r = await fetch('/api/products?active=true', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    setProducts((j.products as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      sku: (p.sku as string) ?? null,
      barcode: (p.barcode as string) ?? null,
      extra_barcodes: (p.extra_barcodes as string[]) ?? [],
      sale_price_ttc: Number(p.sale_price_ttc),
      discount_type: (p.discount_type as 'percent' | 'amount' | null) ?? null,
      discount_value: p.discount_value != null ? Number(p.discount_value) : null,
      category_name: (p.category_name as string) ?? null,
      raw: p,
    })));
  }, []);

  useEffect(() => {
    if (!station) return;
    setLoading(true);
    void (async () => {
      const [, s, rc, tx] = await Promise.all([
        reloadProducts(),
        fetch('/api/settings/labels'),
        fetch(`/api/cloudprnt/printers/label?store_id=${encodeURIComponent(station.store_id)}`),
        fetch('/api/tax-rates'),
      ]);
      if (s.ok) setSettings((await s.json()).settings as LabelSettings);
      if (rc.ok) {
        const p = (await rc.json()).printer as { label: string } | null;
        setCloudPrinter(p?.label ?? null);
      }
      if (tx.ok) {
        setTaxRates(((await tx.json()).tax_rates as TaxRate[]).map((t) => ({ ...t, rate: Number(t.rate) })));
      }
      setLoading(false);
    })();
  }, [station, reloadProducts]);

/* --- Code inconnu : rester sur l’écran courant, sans ouvrir la création --- */
const onUnknownCode = useCallback((code: string) => {
  notify(`Article introuvable pour « ${code} »`, 'error');
}, [notify]);

  const home = () => setScreen('home');

  /** Purge le cache hors-ligne et le service worker, puis recharge. */
  async function forceUpdate() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* on recharge quand même */ }
    window.location.replace(`/pda?v=${Date.now()}`);
  }

  /* --- États d'attente --- */
  if (station === undefined || (station && loading)) {
    return (
      <Screen>
        <Header title="HelloPos PDA" />
        <div className="flex-1 grid place-items-center text-sm text-ink-soft">Chargement…</div>
      </Screen>
    );
  }
  if (station === null) {
    return (
      <Screen>
        <Header title="HelloPos PDA" />
        <div className="flex-1 grid place-items-center p-6 text-center text-sm text-ink-soft">
          Aucune boutique rattachée à cet appareil.<br />
          Appairez-le depuis le back-office (Réglages → PDA étiquettes).
        </div>
      </Screen>
    );
  }

  /* --- Modales plein écran : elles remplacent l'écran courant --- */
  if (createFor !== null) {
    return (
      <ProductFormModal
        inline
        product={null}
        taxRates={taxRates}
        categories={[]}
        backOffice={false}
        prefillBarcode={createFor || undefined}
        posteStoreOverride={station.store_id}
        onClose={() => setCreateFor(null)}
        onSaved={() => { setCreateFor(null); notify('Article créé.'); void reloadProducts(); }}
      />
    );
  }
  if (editing) {
    return (
      <ProductFormModal
        inline
        product={editing}
        taxRates={taxRates}
        categories={[]}
        backOffice={false}
        posteStoreOverride={station.store_id}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); notify('Article modifié.'); void reloadProducts(); }}
      />
    );
  }

  /* --- Modules --- */
  if (screen === 'stock') {
    return (
      <PdaStock
        station={station}
        products={products}
        settings={settings}
        cloudPrinter={cloudPrinter}
        onUnknownCode={onUnknownCode}
        onHome={home}
        notify={notify}
      />
    );
  }
  if (screen === 'labels') {
    return (
      <PdaLabels
        station={station}
        products={products}
        settings={settings}
        cloudPrinter={cloudPrinter}
        onUnknownCode={onUnknownCode}
        onEdit={(p) => p.raw && setEditing(toEditable(p.raw))}
        canWrite={canWrite}
        onHome={home}
        notify={notify}
      />
    );
  }
  if (screen === 'inventory') {
    return <PdaInventory station={station} onHome={home} notify={notify} />;
  }
  if (screen === 'diagnostic') {
    return <PdaDiagnostic onBack={() => setScreen('settings')} onHome={home} />;
  }
  if (screen === 'settings') {
    return (
      <Screen>
        <Header title="Paramètres" onBack={home} onHome={home} />
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <div className="card divide-y divide-border">
            <Row label="Boutique" value={station.store_name} />
            <Row label="Poste" value={station.name || 'PDA'} />
            <Row label="Articles en mémoire" value={String(products.length)} />
            <Row label="Format d'étiquette" value={`${settings.width_mm} × ${settings.height_mm} mm`} />
            <Row label="Imprimante étiquettes" value={cloudPrinter ?? 'Impression navigateur'} />
            <Row label="Version installée" value={process.env.NEXT_PUBLIC_BUILD_ID ?? '—'} />
          </div>
          <button
            onClick={() => { void reloadProducts().then(() => notify('Catalogue actualisé.')); }}
            className="btn-soft h-12 w-full"
          >
            Actualiser le catalogue
          </button>
          <button onClick={() => setScreen('diagnostic')} className="btn-soft h-12 w-full">
            Diagnostic du scan
          </button>
          {/* Une PWA ajoutée à l'écran d'accueil peut continuer à exécuter une
              version en cache. Ce bouton la force à repartir du serveur. */}
          <button
            onClick={() => { void forceUpdate(); }}
            className="btn-soft h-12 w-full"
          >
            Forcer la mise à jour de l&apos;application
          </button>
          <button
            onClick={() => { void fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.assign('/pda')); }}
            className="h-12 w-full rounded-xl border border-danger/40 text-danger font-medium active:bg-danger/5"
          >
            Dissocier ce PDA
          </button>
        </div>
        {flash && <Toast message={flash.text} tone={flash.tone} />}
      </Screen>
    );
  }

  /* --- Accueil --- */
  return (
    <Screen>
      <header
        className="shrink-0 flex items-center gap-3 px-4 text-white"
        style={{
          backgroundColor: 'var(--primary-deep, #3C513D)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          minHeight: 'calc(3.75rem + env(safe-area-inset-top, 0px))',
        }}
      >
        {/* Le logo, ou rien : aucun repli. */}
        {brand.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo_url} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
        )}
        <span className="text-sm font-medium opacity-80">PDA</span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        <MenuCard
          tone="stock"
          icon={<IconScanIn />}
          title="Entrée de marchandise"
          subtitle="Scanner pour ajouter du stock"
          onClick={() => setScreen('stock')}
        />
        <MenuCard
          tone="labels"
          icon={<IconTag />}
          title="Imprimer étiquettes"
          subtitle="Imprimer les étiquettes produits"
          onClick={() => setScreen('labels')}
        />
        <MenuCard
          tone="inventory"
          icon={<IconClipboard />}
          title="Inventaire"
          subtitle="Scanner pour réaliser un inventaire"
          onClick={() => setScreen('inventory')}
          disabled={!canInventory}
        />
        <MenuCard
          tone="settings"
          icon={<IconGear />}
          title="Paramètres"
          subtitle="Configuration de l'application"
          onClick={() => setScreen('settings')}
        />
      </div>

      {flash && <Toast message={flash.text} tone={flash.tone} />}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-medium text-right truncate">{value}</span>
    </div>
  );
}
