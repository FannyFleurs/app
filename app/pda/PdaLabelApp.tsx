'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { formatEUR } from '@/lib/services/money';
import { useBrand } from '@/components/BrandMark';
import ProductFormModal from '@/app/(app)/products/ProductFormModal';
import PdaInventory from './PdaInventory';
import PdaBatchStock from './PdaBatchStock';
import {
  buildLabelsDocument,
  openPrintWindow,
  discountedPrice,
  type LabelProduct,
} from '@/lib/services/label-print';
import {
  LABEL_DEFAULTS,
  type LabelSettings,
} from '@/lib/settings/label';

interface Product extends LabelProduct {
  id: string;
  extra_barcodes?: string[] | null;
  image_url?: string | null;
  category_name?: string | null;

  /** Enregistrement brut (API) pour l'édition, avec tous les champs. */
  raw?: Record<string, unknown>;
}

/** Type accepté par ProductFormModal. */
type EditableProduct = {
  id: string;
  name: string;
  short_description: string | null;
  sku: string | null;
  barcode: string | null;
  extra_barcodes?: string[] | null;
  sale_price_ttc: number;
  price_is_free: boolean;
  purchase_price_ht?: number | null;
  transport_cost_ht?: number | null;
  tax_rate_id: string;
  category_id: string | null;
  supplier_id?: string | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  visible_in_pos: boolean;
  is_active: boolean;
  is_seasonal: boolean;
  is_customizable: boolean;
  is_top_product?: boolean;
  no_discount?: boolean;
  color?: string | null;
  image_url?: string | null;
  store_ids?: string[];
};

function toEditable(r: Record<string, unknown>): EditableProduct {
  const num = (v: unknown) => (v != null ? Number(v) : null);

  return {
    id: String(r.id),
    name: String(r.name),
    short_description: (r.short_description as string) ?? null,
    sku: (r.sku as string) ?? null,
    barcode: (r.barcode as string) ?? null,
    extra_barcodes: (r.extra_barcodes as string[]) ?? [],
    sale_price_ttc: Number(r.sale_price_ttc),
    price_is_free: !!r.price_is_free,
    purchase_price_ht: num(r.purchase_price_ht),
    transport_cost_ht: num(r.transport_cost_ht),
    tax_rate_id: String(r.tax_rate_id ?? ''),
    category_id: (r.category_id as string) ?? null,
    supplier_id: (r.supplier_id as string) ?? null,
    discount_type:
      (r.discount_type as 'percent' | 'amount' | null) ?? null,
    discount_value: num(r.discount_value),
    visible_in_pos: r.visible_in_pos !== false,
    is_active: r.is_active !== false,
    is_seasonal: !!r.is_seasonal,
    is_customizable: !!r.is_customizable,
    is_top_product: !!r.is_top_product,
    no_discount: !!r.no_discount,
    color: (r.color as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    store_ids: (r.store_ids as string[]) ?? [],
  };
}

interface Station {
  id: string;
  store_id: string;
  store_name: string;
  name: string;
}

interface TaxRate {
  id: string;
  code: string;
  rate: number;
  label: string;
  is_default: boolean;
}

interface RecentAction {
  kind: 'label' | 'stock' | 'create';
  title: string;
  sub: string;
  at: string;
}

type ScanMode = 'choice' | 'label' | 'stock';

export default function PdaLabelApp({
  userName,
  canWrite,
  canInventory,
}: {
  userName: string;
  canWrite: boolean;
  canInventory: boolean;
}) {
  const rawBrand = useBrand();

  // Logo spécifique PDA si configuré, sinon logo principal.
  const brand = {
    ...rawBrand,
    logo_url: rawBrand.pda_logo_url || rawBrand.logo_url,
  };

  const [station, setStation] = useState<
    Station | null | undefined
  >(undefined);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  const [settings, setSettings] =
    useState<LabelSettings>(LABEL_DEFAULTS);

  const [cloudPrinter, setCloudPrinter] = useState<string | null>(
    null,
  );

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [qtyStr, setQtyStr] = useState('');

  const qty = Math.min(
    200,
    Math.max(0, parseInt(qtyStr || '0', 10) || 0),
  );

  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Code-barres prérempli. Chaîne vide = création sans code prérempli.
  const [createFor, setCreateFor] = useState<string | null>(null);

  // Édition article.
  const [editing, setEditing] = useState<EditableProduct | null>(
    null,
  );

  // Choix étiquette / stock.
  const [pending, setPending] = useState<Product | null>(null);

  // Entrée de stock.
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [stockQtyStr, setStockQtyStr] = useState('');
  const [stockLevel, setStockLevel] = useState<number | null>(null);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const [stockSending, setStockSending] = useState(false);

  // Quantité de la dernière entrée validée.
  const [lastStockQty, setLastStockQty] = useState(0);

  const photoRef = useRef<HTMLInputElement>(null);

  // Tableau de bord.
  const [homeTab, setHomeTab] = useState<
    'home' | 'articles' | 'history' | 'settings'
  >('home');

  // Mode de scan armé.
  const [scanPrompt, setScanPrompt] = useState<
    null | 'choice' | 'label' | 'stock'
  >(null);

  const [invOpen, setInvOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  const promptRef = useRef<HTMLInputElement>(null);

  // Timer pour les lecteurs injectant la donnée sans Entrée.
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Protection contre un scan traité deux fois :
  // une fois dans onInput, puis une seconde fois avec Entrée.
  const lastScanRef = useRef<{
    code: string;
    at: number;
  }>({
    code: '',
    at: 0,
  });

  const [recent, setRecent] = useState<RecentAction[]>([]);

  // ---------------------------------------------------------------------------
  // Activité récente
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem('webpos_pda_recent');

      if (saved) {
        setRecent(JSON.parse(saved) as RecentAction[]);
      }
    } catch {
      // Ignore les erreurs de stockage local.
    }
  }, []);

  function addRecent(
    kind: RecentAction['kind'],
    title: string,
    sub: string,
  ) {
    let hh = '';

    try {
      hh = new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // Ignore les erreurs de formatage.
    }

    setRecent((current) => {
      const next = [
        {
          kind,
          title,
          sub,
          at: hh,
        },
        ...current,
      ].slice(0, 30);

      try {
        localStorage.setItem(
          'webpos_pda_recent',
          JSON.stringify(next),
        );
      } catch {
        // Ignore les erreurs de quota.
      }

      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Résolution de la station PDA
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();

      const response = await fetch(
        `/api/label-stations/mine?device_id=${encodeURIComponent(
          deviceId,
        )}`,
      );

      let resolvedStation = response.ok
        ? ((await response.json()).station as Station | null)
        : null;

      if (!resolvedStation) {
        const meResponse = await fetch('/api/me');

        const accessible = meResponse.ok
          ? (((await meResponse.json()).stores ?? []) as Array<{
              id: string;
              name: string;
            }>)
          : [];

        if (accessible.length >= 1) {
          const store = accessible[0]!;

          await fetch('/api/label-stations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              device_id: deviceId,
              store_id: store.id,
            }),
          });

          resolvedStation = {
            id: '',
            store_id: store.id,
            store_name: store.name,
            name: `PDA ${store.name}`,
          };
        }
      }

      setStation(resolvedStation ?? null);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Chargement du catalogue
  // ---------------------------------------------------------------------------

  async function reloadProducts() {
    const response = await fetch('/api/products?active=true');

    if (!response.ok) {
      return;
    }

    const json = await response.json();

    setProducts(
      (
        json.products as Array<Record<string, unknown>>
      ).map((product) => ({
        id: String(product.id),
        name: String(product.name),
        sku: (product.sku as string) ?? null,
        barcode: (product.barcode as string) ?? null,
        extra_barcodes:
          (product.extra_barcodes as string[]) ?? [],
        sale_price_ttc: Number(product.sale_price_ttc),
        discount_type:
          (product.discount_type as
            | 'percent'
            | 'amount'
            | null) ?? null,
        discount_value:
          product.discount_value != null
            ? Number(product.discount_value)
            : null,
        image_url: (product.image_url as string) ?? null,
        category_name:
          (product.category_name as string) ?? null,
        raw: product,
      })),
    );
  }

  useEffect(() => {
    if (!station) {
      return;
    }

    setLoading(true);

    void (async () => {
      const [, settingsResponse, printersResponse, taxResponse] =
        await Promise.all([
          reloadProducts(),
          fetch('/api/settings/labels'),
          fetch('/api/cloudprnt/printers'),
          fetch('/api/tax-rates'),
        ]);

      if (settingsResponse.ok) {
        setSettings(
          (await settingsResponse.json())
            .settings as LabelSettings,
        );
      }

      if (printersResponse.ok) {
        const printers = (await printersResponse.json())
          .printers as Array<{
          label: string;
          role: string;
          enabled: boolean;
        }>;

        const printer = printers.find(
          (item) =>
            item.role === 'label' && item.enabled,
        );

        setCloudPrinter(printer ? printer.label : null);
      }

      if (taxResponse.ok) {
        const rates = (await taxResponse.json())
          .tax_rates as TaxRate[];

        setTaxRates(
          rates.map((rate) => ({
            ...rate,
            rate: Number(rate.rate),
          })),
        );
      }

      setLoading(false);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station]);

  // ---------------------------------------------------------------------------
  // Scanner global
  // ---------------------------------------------------------------------------

  const scanFnRef = useRef<(code: string) => void>(() => {});

  useEffect(() => {
    scanFnRef.current = (code: string) => {
      // Aucun scan pendant les écrans ou modales où une action est déjà en cours.
      if (
        selected ||
        createFor !== null ||
        editing ||
        stockFor ||
        pending ||
        invOpen ||
        batchOpen
      ) {
        return;
      }

      const mode = scanPrompt ?? 'choice';

      if (!scanPrompt) {
        setScanPrompt('choice');
      }

      handleCode(code, mode);
    };
  });

  useEffect(() => {
    let buffer = '';
    let lastKeyAt = 0;

    function onKey(event: KeyboardEvent) {
      const activeElement =
        document.activeElement as HTMLElement | null;

      const tag = activeElement?.tagName;

      // Lorsqu'un champ est actif, le champ gère lui-même le scan.
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        activeElement?.isContentEditable
      ) {
        return;
      }

      if (event.key === 'Enter') {
        if (buffer.length >= 3) {
          scanFnRef.current(buffer);
        }

        buffer = '';
        return;
      }

      if (event.key.length === 1) {
        const now = Date.now();

        // Une pause supérieure à 300 ms indique une nouvelle séquence.
        if (now - lastKeyAt > 300) {
          buffer = '';
        }

        lastKeyAt = now;
        buffer += event.key;
      }
    }

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Nettoie le timer si le composant est démonté.
  useEffect(() => {
    return () => {
      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Recherche catalogue
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();

    if (!search) {
      return products;
    }

    return products.filter((product) => {
      const extraMatch =
        product.extra_barcodes?.some((barcode) =>
          barcode.toLowerCase().includes(search),
        ) ?? false;

      return (
        product.name.toLowerCase().includes(search) ||
        (product.sku?.toLowerCase().includes(search) ??
          false) ||
        (product.barcode
          ?.toLowerCase()
          .includes(search) ?? false) ||
        extraMatch
      );
    });
  }, [products, q]);

  // ---------------------------------------------------------------------------
  // Traitement strict d'un code scanné
  // ---------------------------------------------------------------------------

  function handleCode(
    raw: string,
    mode: ScanMode = 'choice',
  ) {
    const code = raw
      .replace(/[\r\n\t]/g, '')
      .trim()
      .toUpperCase();

    if (!code) {
      return;
    }

    const now = Date.now();

    // Le même scan peut être reçu une fois par onInput puis une seconde fois
    // via la touche Entrée. On ignore le doublon immédiat.
    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.at < 800
    ) {
      return;
    }

    lastScanRef.current = {
      code,
      at: now,
    };

    // Recherche uniquement sur une correspondance exacte.
    // filtered ne doit jamais être utilisé ici comme solution de secours.
    const hit = products.find((product) => {
      const barcode = String(product.barcode ?? '')
        .trim()
        .toUpperCase();

      const sku = String(product.sku ?? '')
        .trim()
        .toUpperCase();

      const extraBarcodes = Array.isArray(
        product.extra_barcodes,
      )
        ? product.extra_barcodes.map((value) =>
            String(value ?? '')
              .trim()
              .toUpperCase(),
          )
        : [];

      return (
        barcode === code ||
        sku === code ||
        extraBarcodes.includes(code)
      );
    });

    // Toujours effacer l'ancienne recherche.
    setQ('');
    setMsg(null);

    if (hit) {
      if (mode !== 'choice') {
        setScanPrompt(null);
      }

      routeProduct(hit, mode);
      return;
    }

    // Le code n'est pas reconnu. On ferme tout ancien produit afin de ne jamais
    // continuer une saisie sur le mauvais article.
    setPending(null);
    setSelected(null);
    setStockFor(null);
    setScanPrompt(null);

    if (canWrite) {
      setCreateFor(code);
    } else {
      setMsg(
        `Article introuvable pour le code ${code}.`,
      );
    }
  }

  function routeProduct(
    product: Product,
    mode: ScanMode,
  ) {
    if (mode === 'label') {
      openProduct(product);
    } else if (mode === 'stock') {
      void startStock(product);
    } else {
      pickProduct(product);
    }
  }

  function pickProduct(product: Product) {
    setPending(product);
    setQ('');
    setMsg(null);
  }

  function openProduct(product: Product) {
    setSelected(product);
    setQtyStr('');
    setQ('');
    setMsg(null);
  }

  function backToList() {
    setSelected(null);
    setMsg(null);
    setQtyStr('');
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goTab = (
    tab:
      | 'home'
      | 'articles'
      | 'history'
      | 'settings',
  ) => {
    setScanPrompt(null);
    setSelected(null);
    setPending(null);
    setMsg(null);
    setQ('');
    setHomeTab(tab);
  };

  const renderBottomNav = () => (
    <nav className="shrink-0 border-t border-border bg-surface grid grid-cols-5 items-end px-2 pt-1 pb-1 relative z-30 overflow-visible">
      <NavItem
        active={
          !selected &&
          !scanPrompt &&
          homeTab === 'home'
        }
        label="Accueil"
        icon={<IconHome />}
        onClick={() => goTab('home')}
      />

      <NavItem
        active={
          !selected &&
          !scanPrompt &&
          homeTab === 'history'
        }
        label="Historique"
        icon={<IconClock />}
        onClick={() => goTab('history')}
      />

      <div className="grid place-items-center">
        <button
          onClick={() => {
            setQ('');
            setMsg(null);
            setPending(null);
            setScanPrompt('choice');
          }}
          className="h-14 w-14 -mt-5 rounded-full accent-bar text-white grid place-items-center shadow-lg relative z-10"
        >
          <IconBarcode />
        </button>

        <span className="text-[10px] mt-0.5 text-ink-soft">
          Scanner
        </span>
      </div>

      <NavItem
        active={
          !selected &&
          !scanPrompt &&
          homeTab === 'articles'
        }
        label="Articles"
        icon={<IconBox />}
        onClick={() => goTab('articles')}
      />

      <NavItem
        active={
          !selected &&
          !scanPrompt &&
          homeTab === 'settings'
        }
        label="Paramètres"
        icon={<IconGear />}
        onClick={() => goTab('settings')}
      />
    </nav>
  );

  // ---------------------------------------------------------------------------
  // Entrée de stock
  // ---------------------------------------------------------------------------

  async function startStock(product: Product) {
    setStockFor(product);
    setStockQtyStr('');
    setStockLevel(null);
    setStockMsg(null);
    setLastStockQty(0);

    if (!station) {
      return;
    }

    try {
      const response = await fetch(
        `/api/stock/levels?store_id=${encodeURIComponent(
          station.store_id,
        )}`,
      );

      if (response.ok) {
        const levels = (await response.json())
          .levels as Array<{
          product_id: string;
          quantity: string;
        }>;

        const level = levels.find(
          (item) => item.product_id === product.id,
        );

        setStockLevel(
          level ? Number(level.quantity) : 0,
        );
      }
    } catch {
      // Niveau inconnu.
    }
  }

  function pressStockQty(key: string) {
    setStockQtyStr((current) => {
      if (key === 'C') {
        return '';
      }

      if (key === '⌫') {
        return current.slice(0, -1);
      }

      const next = (current + key).replace(
        /^0+(?=\d)/,
        '',
      );

      return next.length > 4 ? current : next;
    });
  }

  async function validateStock() {
    if (!stockFor || !station) {
      return;
    }

    const quantity =
      parseInt(stockQtyStr || '0', 10) || 0;

    if (quantity < 1) {
      return;
    }

    const currentProduct = stockFor;

    setStockSending(true);
    setStockMsg(null);

    const response = await fetch(
      '/api/stock/movement',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_id: station.store_id,
          product_id: currentProduct.id,
          movement_type: 'purchase',
          quantity_delta: quantity,
          reason: 'Entrée PDA (scan)',
        }),
      },
    );

    setStockSending(false);

    if (response.ok) {
      const newLevel =
        (stockLevel ?? 0) + quantity;

      setStockLevel(newLevel);
      setStockMsg(
        `✅ +${quantity} en stock (total : ${newLevel}).`,
      );
      setLastStockQty(quantity);
      setStockQtyStr('');

      addRecent(
        'stock',
        'Stock entré',
        `${currentProduct.name} · +${quantity}`,
      );
    } else {
      const json = await response
        .json()
        .catch(() => null);

      setStockMsg(
        json?.error === 'FORBIDDEN'
          ? 'Droits insuffisants pour ajuster le stock.'
          : "❌ Échec de l'entrée de stock.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Quantité étiquettes
  // ---------------------------------------------------------------------------

  function pressQty(key: string) {
    setQtyStr((current) => {
      if (key === 'C') {
        return '';
      }

      if (key === '⌫') {
        return current.slice(0, -1);
      }

      const next = (current + key).replace(
        /^0+(?=\d)/,
        '',
      );

      if (next.length > 3) {
        return current;
      }

      return Number(next) > 200 ? '200' : next;
    });
  }

  // ---------------------------------------------------------------------------
  // Impression
  // ---------------------------------------------------------------------------

  async function printLabelsFor(
    product: Product,
    count: number,
  ): Promise<string> {
    if (count < 1) {
      return '';
    }

    if (cloudPrinter) {
      const response = await fetch(
        '/api/cloudprnt/print-labels',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entries: [
              {
                product,
                qty: count,
              },
            ],
            store_id: station?.store_id ?? null,
          }),
        },
      );

      if (response.ok) {
        const json = await response.json();

        return `✅ ${json.count} étiquette(s) envoyée(s) à « ${json.printer} ».`;
      }

      return "❌ Échec de l'envoi à l'imprimante.";
    }

    const documentContent = buildLabelsDocument(
      [
        {
          product,
          qty: count,
        },
      ],
      settings,
    );

    return openPrintWindow(documentContent)
      ? ''
      : 'Autorisez les fenêtres pop-up pour imprimer.';
  }

  async function print() {
    if (!selected || qty < 1) {
      return;
    }

    const currentProduct = selected;

    setMsg(null);
    setSending(true);

    const message = await printLabelsFor(
      currentProduct,
      qty,
    );

    setSending(false);

    if (message) {
      setMsg(message);
    }

    if (!message.startsWith('❌')) {
      addRecent(
        'label',
        'Étiquette imprimée',
        `${currentProduct.name} · ${qty}`,
      );
    }
  }

  async function printStockLabels() {
    if (!stockFor || lastStockQty < 1) {
      return;
    }

    setStockSending(true);

    const message = await printLabelsFor(
      stockFor,
      lastStockQty,
    );

    setStockSending(false);

    setStockMsg(
      message ||
        `🖨 ${lastStockQty} étiquette(s) lancée(s) à l'impression.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Photo produit
  // ---------------------------------------------------------------------------

  async function onPhoto(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file || !selected) {
      return;
    }

    const currentProduct = selected;

    setPhotoBusy(true);
    setMsg(null);

    try {
      const dataUrl = await compressImage(
        file,
        900,
        0.7,
      );

      const response = await fetch(
        `/api/products/${currentProduct.id}/photo`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: dataUrl,
          }),
        },
      );

      if (response.ok) {
        setSelected((current) =>
          current
            ? {
                ...current,
                image_url: dataUrl,
              }
            : current,
        );

        setProducts((current) =>
          current.map((product) =>
            product.id === currentProduct.id
              ? {
                  ...product,
                  image_url: dataUrl,
                }
              : product,
          ),
        );

        setMsg('📷 Photo enregistrée.');
      } else {
        setMsg(
          "❌ Échec de l'enregistrement de la photo.",
        );
      }
    } catch {
      setMsg('❌ Photo illisible.');
    }

    setPhotoBusy(false);
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Ignore.
    }

    window.location.assign('/pda');
  }

  // ---------------------------------------------------------------------------
  // PDA non appairé
  // ---------------------------------------------------------------------------

  if (station === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg p-6 pt-safe pb-safe pl-safe pr-safe">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrandLogo brand={brand} />
          </div>

          <h1 className="text-lg font-semibold">
            PDA non appairé
          </h1>

          <p className="mt-1 text-sm text-ink-soft">
            Cet appareil n&apos;est rattaché à aucune
            boutique. Ré-appairez-le avec le code ou le QR
            généré en back-office.
          </p>

          <button
            onClick={() => void logout()}
            className="btn-primary w-full h-12 mt-4"
          >
            Appairer ce PDA
          </button>
        </div>
      </div>
    );
  }

  if (station === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-ink-soft">
        Chargement…
      </div>
    );
  }

  const discounted =
    selected && settings.show_discount
      ? discountedPrice(selected)
      : null;

  // ---------------------------------------------------------------------------
  // Création article
  // ---------------------------------------------------------------------------

  if (createFor !== null) {
    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{
          paddingBottom:
            'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{
            paddingTop:
              'env(safe-area-inset-top, 0px)',
            minHeight:
              'calc(3.5rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <button
            onClick={() => setCreateFor(null)}
            className="text-sm text-accent-deep hover:underline"
          >
            ← Retour
          </button>

          <div className="flex-1 text-center font-semibold">
            Nouvel article
          </div>

          <div className="w-16" />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <ProductFormModal
            inline
            product={null}
            taxRates={taxRates}
            categories={[]}
            backOffice={false}
            prefillBarcode={
              createFor || undefined
            }
            posteStoreOverride={station.store_id}
            onClose={() => setCreateFor(null)}
            onSaved={async () => {
              setCreateFor(null);

              addRecent(
                'create',
                'Nouvel article créé',
                '',
              );

              await reloadProducts();
            }}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Édition article
  // ---------------------------------------------------------------------------

  if (editing) {
    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{
          paddingBottom:
            'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{
            paddingTop:
              'env(safe-area-inset-top, 0px)',
            minHeight:
              'calc(3.5rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <button
            onClick={() => setEditing(null)}
            className="text-sm text-accent-deep hover:underline"
          >
            ← Retour
          </button>

          <div className="flex-1 text-center font-semibold">
            Modifier l&apos;article
          </div>

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

              await reloadProducts();

              if (selected) {
                const response = await fetch(
                  `/api/products?active=true&store_id=${encodeURIComponent(
                    station.store_id,
                  )}`,
                );

                if (response.ok) {
                  const productsResponse = (
                    (await response.json())
                      .products as Array<
                      Record<string, unknown>
                    >
                  );

                  const product =
                    productsResponse.find(
                      (item) =>
                        String(item.id) ===
                        selected.id,
                    );

                  if (product) {
                    setSelected({
                      id: selected.id,
                      name: String(product.name),
                      sku:
                        (product.sku as string) ??
                        null,
                      barcode:
                        (product.barcode as string) ??
                        null,
                      extra_barcodes:
                        (product.extra_barcodes as string[]) ??
                        [],
                      sale_price_ttc: Number(
                        product.sale_price_ttc,
                      ),
                      discount_type:
                        (product.discount_type as
                          | 'percent'
                          | 'amount'
                          | null) ?? null,
                      discount_value:
                        product.discount_value != null
                          ? Number(
                              product.discount_value,
                            )
                          : null,
                      image_url:
                        (product.image_url as string) ??
                        null,
                      category_name:
                        (product.category_name as string) ??
                        null,
                      raw: product,
                    });
                  }
                }
              }
            }}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Entrée de stock
  // ---------------------------------------------------------------------------

  if (stockFor) {
    const stockQuantity =
      parseInt(stockQtyStr || '0', 10) || 0;

    return (
      <div
        className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
        style={{
          paddingBottom:
            'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <header
          className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
          style={{
            paddingTop:
              'env(safe-area-inset-top, 0px)',
            minHeight:
              'calc(3.5rem + env(safe-area-inset-top, 0px))',
          }}
        >
          <button
            onClick={() => {
              setStockFor(null);
              setStockMsg(null);
              setStockQtyStr('');
              setLastStockQty(0);
            }}
            className="text-sm text-accent-deep hover:underline"
          >
            ← Retour
          </button>

          <div className="flex-1 text-center font-semibold">
            Entrée de stock
          </div>

          <div className="w-16" />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
          <div className="font-semibold text-lg leading-tight">
            {stockFor.name}
          </div>

          <div className="text-sm text-ink-soft">
            {stockFor.barcode ??
              'pas de code-barres'}{' '}
            · Stock actuel :{' '}
            <span className="font-semibold text-ink">
              {stockLevel == null
                ? '…'
                : stockLevel}
            </span>
          </div>

          <div className="mt-4 text-xs text-ink-soft">
            Quantité à ajouter
          </div>

          <div className="mt-1 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
            {stockQtyStr === '' ? (
              <span className="text-ink-soft/40">
                0
              </span>
            ) : (
              `+${stockQtyStr}`
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
              'C',
              '0',
              '⌫',
            ].map((key) => (
              <button
                key={key}
                onClick={() =>
                  pressStockQty(key)
                }
                className={`h-14 rounded-xl text-xl font-semibold ${
                  key === 'C'
                    ? 'bg-danger/10 text-danger'
                    : key === '⌫'
                      ? 'bg-gray-100 text-ink-soft'
                      : 'bg-gray-50 border border-border'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {stockMsg && (
            <p className="mt-3 text-sm text-center">
              {stockMsg}
            </p>
          )}

          <button
            onClick={() => void validateStock()}
            disabled={
              stockQuantity < 1 || stockSending
            }
            className="btn-primary h-14 mt-4 text-base"
          >
            {stockSending
              ? '…'
              : stockQuantity > 0
                ? `Valider l'entrée (+${stockQuantity})`
                : "Valider l'entrée de stock"}
          </button>

          {lastStockQty > 0 && (
            <button
              onClick={() =>
                void printStockLabels()
              }
              disabled={stockSending}
              className="btn-soft h-14 mt-2 text-base"
            >
              🖨 Imprimer {lastStockQty}{' '}
              étiquette
              {lastStockQty > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Inventaire
  // ---------------------------------------------------------------------------

  if (invOpen) {
    return (
      <PdaInventory
        storeId={station.store_id}
        storeName={station.store_name}
        onClose={() => setInvOpen(false)}
        onCounted={(label) =>
          addRecent(
            'stock',
            'Comptage inventaire validé',
            label,
          )
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Entrée multiple
  // ---------------------------------------------------------------------------

  if (batchOpen) {
    return (
      <PdaBatchStock
        storeId={station.store_id}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          barcode: product.barcode ?? null,
          sku: product.sku ?? null,
          extra_barcodes:
            product.extra_barcodes ?? [],
        }))}
        onClose={() => setBatchOpen(false)}
        onDone={(count) =>
          addRecent(
            'stock',
            'Entrée multiple validée',
            `${count} article(s)`,
          )
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Application principale
  // ---------------------------------------------------------------------------

  return (
    <div
      className="h-screen flex flex-col bg-bg text-ink overflow-hidden"
      style={{
        paddingBottom:
          'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <header
        className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
        style={{
          paddingTop:
            'env(safe-area-inset-top, 0px)',
          minHeight:
            'calc(3.5rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <BrandLogo brand={brand} />

        <div className="flex-1" />

        <span className="text-xs text-ink-soft truncate max-w-[45%]">
          {userName}
        </span>
      </header>

      {selected ? (
        <section className="flex-1 min-h-0 flex flex-col p-4 bg-surface">
          <div className="flex items-start justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="font-semibold leading-tight line-clamp-2 text-lg">
                {selected.name}
              </div>

              <div className="text-sm text-ink-soft">
                {discounted != null && (
                  <span className="line-through mr-1">
                    {formatEUR(
                      selected.sale_price_ttc,
                    )}
                  </span>
                )}

                <span className="font-semibold text-ink">
                  {formatEUR(
                    discounted ??
                      selected.sale_price_ttc,
                  )}
                </span>

                {selected.barcode
                  ? ` · ${selected.barcode}`
                  : ' · pas de code-barres'}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canWrite && (
                <button
                  onClick={() =>
                    selected.raw &&
                    setEditing(
                      toEditable(selected.raw),
                    )
                  }
                  className="btn-soft h-9 px-3 text-sm"
                  aria-label="Éditer l'article"
                >
                  ✎
                </button>
              )}

              <button
                onClick={backToList}
                className="text-ink-soft hover:text-ink text-2xl leading-none"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-ink-soft shrink-0">
            Nombre d&apos;étiquettes
          </div>

          <div className="mt-1 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white shrink-0">
            {qtyStr === '' ? (
              <span className="text-ink-soft/40">
                0
              </span>
            ) : (
              qtyStr
            )}
          </div>

          <div className="mt-2 grid grid-cols-3 grid-rows-4 gap-2 flex-1 min-h-0">
            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
              'C',
              '0',
              '⌫',
            ].map((key) => (
              <button
                key={key}
                onClick={() => pressQty(key)}
                className={`rounded-xl text-2xl font-semibold min-h-[44px] ${
                  key === 'C'
                    ? 'bg-danger/10 text-danger'
                    : key === '⌫'
                      ? 'bg-gray-100 text-ink-soft'
                      : 'bg-gray-50 border border-border active:bg-gray-100'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          <div
            className={`mt-3 grid gap-2 shrink-0 ${
              canWrite
                ? 'grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {canWrite && (
              <button
                onClick={() =>
                  photoRef.current?.click()
                }
                disabled={photoBusy}
                className="btn-soft h-14 flex-col gap-0.5 text-sm disabled:opacity-40"
              >
                <span className="text-xl">📷</span>
                <span>
                  {photoBusy ? '…' : 'Photo'}
                </span>
              </button>
            )}

            <button
              onClick={() => void print()}
              disabled={qty < 1 || sending}
              className="btn-primary h-14 flex-col gap-0.5 text-sm disabled:opacity-40"
            >
              <span className="text-xl">🖨</span>
              <span>
                {sending ? '…' : 'Imprimer'}
              </span>
            </button>
          </div>

          {msg && (
            <p className="mt-1 text-sm text-center shrink-0">
              {msg}
            </p>
          )}
        </section>
      ) : (
        <main className="flex-1 min-h-0 overflow-y-auto">
          {homeTab === 'home' && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ActionCard
                  tone="rose"
                  title="Imprimer une étiquette"
                  desc="Scannez un code-barres pour imprimer l'étiquette du produit."
                  icon={<IconPrinter />}
                  onClick={() => {
                    setQ('');
                    setMsg(null);
                    setScanPrompt('label');
                  }}
                />

                {canWrite && (
                  <ActionCard
                    tone="green"
                    title="Entrer en stock"
                    desc="Scannez un code-barres pour entrer la marchandise en stock."
                    icon={<IconBoxDown />}
                    onClick={() => {
                      setQ('');
                      setMsg(null);
                      setScanPrompt('stock');
                    }}
                  />
                )}

                {canWrite && (
                  <ActionCard
                    tone="green"
                    title="Entrée multiple"
                    desc="Scannez plusieurs articles en série, puis validez la saisie en une fois."
                    icon={<IconBoxes />}
                    onClick={() =>
                      setBatchOpen(true)
                    }
                  />
                )}

                {canWrite && (
                  <ActionCard
                    tone="blue"
                    title="Créer un nouvel article"
                    desc="Créez un nouvel article dans le catalogue."
                    icon={<IconBoxPlus />}
                    onClick={() =>
                      setCreateFor('')
                    }
                  />
                )}

                {canInventory && (
                  <ActionCard
                    tone="amber"
                    title="Inventaire"
                    desc="Comptez un inventaire créé sur la caisse."
                    icon={<IconClipboard />}
                    onClick={() =>
                      setInvOpen(true)
                    }
                  />
                )}
              </div>

              <div>
                <div className="font-semibold mb-2">
                  Dernières actions
                </div>

                <div className="card divide-y divide-border">
                  {recent.length === 0 ? (
                    <div className="p-4 text-sm text-ink-soft">
                      Aucune action récente.
                    </div>
                  ) : (
                    recent
                      .slice(0, 3)
                      .map((action, index) => (
                        <RecentRow
                          key={index}
                          r={action}
                        />
                      ))
                  )}

                  {recent.length > 3 && (
                    <button
                      onClick={() =>
                        setHomeTab('history')
                      }
                      className="w-full p-3 text-sm font-semibold text-accent-deep"
                    >
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
                <div className="relative">
                  <input
                    className="input h-11 w-full pr-10"
                    placeholder="Rechercher un article…"
                    value={q}
                    onChange={(event) =>
                      setQ(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') {
                        return;
                      }

                      event.preventDefault();

                      // Dans la recherche manuelle, Entrée traite strictement
                      // la valeur saisie comme un code.
                      handleCode(q, 'choice');
                    }}
                  />

                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ('')}
                      aria-label="Effacer la recherche"
                      className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-full text-ink-soft hover:bg-gray-100 hover:text-ink"
                    >
                      <span
                        aria-hidden
                        className="text-lg leading-none"
                      >
                        ×
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="p-6 text-sm text-ink-soft">
                  Chargement…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-ink-soft">
                  Aucun article.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((product) => (
                    <li key={product.id}>
                      <button
                        onClick={() =>
                          pickProduct(product)
                        }
                        className="w-full text-left px-3 py-2.5 flex items-center gap-3 active:bg-gray-100"
                      >
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-10 w-10 rounded object-cover shrink-0 bg-gray-100"
                          />
                        ) : (
                          <span className="h-10 w-10 rounded bg-gray-100 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {product.name}
                          </div>

                          <div className="text-xs text-ink-soft truncate">
                            {product.barcode ??
                              '— pas de code-barres —'}
                          </div>
                        </div>

                        <div className="font-semibold tabular-nums whitespace-nowrap">
                          {formatEUR(
                            product.sale_price_ttc,
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {homeTab === 'history' && (
            <div className="p-4">
              <div className="font-semibold mb-2">
                Historique
              </div>

              {recent.length === 0 ? (
                <div className="card p-4 text-sm text-ink-soft">
                  Aucune action récente.
                </div>
              ) : (
                <div className="card divide-y divide-border">
                  {recent.map((action, index) => (
                    <RecentRow
                      key={index}
                      r={action}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {homeTab === 'settings' && (
            <div className="p-4 space-y-3">
              <div className="font-semibold">
                Paramètres
              </div>

              <div className="card p-4 text-sm space-y-1">
                <div>
                  Boutique :{' '}
                  <strong>
                    {station.store_name}
                  </strong>
                </div>

                <div className="text-ink-soft">
                  Utilisateur : {userName}
                </div>
              </div>

              <button
                onClick={() => void logout()}
                className="btn-soft w-full h-11 text-danger"
              >
                Ré-appairer ce PDA
              </button>
            </div>
          )}
        </main>
      )}

      {renderBottomNav()}

      {/* Invite de scan */}
      {scanPrompt && (
        <div
          className="fixed inset-0 z-[64] flex flex-col bg-bg"
          style={{
            paddingTop:
              'env(safe-area-inset-top, 0px)',
            paddingBottom:
              'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="h-14 flex items-center px-4 border-b border-border">
            <button
              onClick={() => {
                if (scanTimer.current) {
                  clearTimeout(scanTimer.current);
                  scanTimer.current = null;
                }

                if (promptRef.current) {
                  promptRef.current.value = '';
                }

                setScanPrompt(null);
              }}
              className="text-sm text-accent-deep"
            >
              ← Annuler
            </button>

            <div className="flex-1 text-center font-semibold">
              {scanPrompt === 'label'
                ? 'Imprimer une étiquette'
                : scanPrompt === 'stock'
                  ? 'Entrer en stock'
                  : 'Scan rapide'}
            </div>

            <div className="w-16" />
          </div>

          <div className="flex-1 grid place-items-center p-6 text-center">
            <div>
              <div className="text-rose-500 mx-auto w-16 h-16 grid place-items-center">
                <IconBarcode big />
              </div>

              <p className="mt-4 text-lg font-semibold">
                Scannez un article
              </p>

              <p className="mt-1 text-sm text-ink-soft">
                Avec le lecteur du PDA.
              </p>

              <input
                ref={promptRef}
                className="input h-12 mt-4 text-center text-lg w-64 max-w-full"
                placeholder="Code-barres…"
                autoComplete="off"
                autoFocus
                inputMode="none"
                onFocus={(event) => {
                  // Toujours repartir d'un champ vide.
                  event.currentTarget.value = '';
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    const input =
                      promptRef.current;

                    if (
                      scanPrompt &&
                      input &&
                      document.body.contains(input)
                    ) {
                      input.value = '';
                      input.focus();
                    }
                  }, 60);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return;
                  }

                  event.preventDefault();

                  const input =
                    event.currentTarget;

                  const value = input.value;

                  // Vider avant de traiter le code empêche l'ancien code
                  // de rester dans le champ pendant le changement d'écran.
                  input.value = '';

                  if (scanTimer.current) {
                    clearTimeout(
                      scanTimer.current,
                    );

                    scanTimer.current = null;
                  }

                  if (value.trim()) {
                    handleCode(
                      value,
                      scanPrompt,
                    );
                  }
                }}
                onInput={(event) => {
                  const input =
                    event.currentTarget;

                  const value = input.value;

                  // Certains lecteurs insèrent directement \r, \n ou \t.
                  const separatorIndex =
                    value.search(/[\r\n\t]/);

                  if (separatorIndex >= 0) {
                    const code = value.slice(
                      0,
                      separatorIndex,
                    );

                    input.value = '';

                    if (scanTimer.current) {
                      clearTimeout(
                        scanTimer.current,
                      );

                      scanTimer.current = null;
                    }

                    if (code.trim()) {
                      handleCode(
                        code,
                        scanPrompt,
                      );
                    }

                    return;
                  }

                  if (scanTimer.current) {
                    clearTimeout(
                      scanTimer.current,
                    );
                  }

                  // Pour un lecteur qui ne transmet pas Entrée, on considère
                  // le scan terminé après 150 ms sans nouveau caractère.
                  scanTimer.current = setTimeout(
                    () => {
                      const code = input.value;

                      input.value = '';
                      scanTimer.current = null;

                      if (
                        code.trim().length >= 3
                      ) {
                        handleCode(
                          code,
                          scanPrompt,
                        );
                      }
                    },
                    150,
                  );
                }}
              />
            </div>
          </div>

          {renderBottomNav()}
        </div>
      )}

      {/* Choix après scan */}
      {pending && (
        <div
          className="fixed inset-0 z-[65] grid place-items-center bg-ink/40 backdrop-blur-sm p-6"
          onClick={() => setPending(null)}
        >
          <div
            className="card w-full max-w-sm p-5 text-center"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="text-base font-semibold leading-tight">
              {pending.name}
            </div>

            <div className="text-sm text-ink-soft">
              {pending.barcode ??
                'pas de code-barres'}
            </div>

            <div className="mt-4 text-sm text-ink-soft">
              Que faire ?
            </div>

            <button
              onClick={() => {
                const product = pending;

                setPending(null);
                openProduct(product);
              }}
              className="btn-primary w-full h-14 mt-2 text-base"
            >
              🖨 Imprimer une étiquette
            </button>

            {canWrite && (
              <button
                onClick={() => {
                  const product = pending;

                  setPending(null);
                  void startStock(product);
                }}
                className="btn-soft w-full h-14 mt-2 text-base"
              >
                📦 Ajouter au stock
              </button>
            )}

            <button
              onClick={() =>
                setPending(null)
              }
              className="mt-3 text-sm text-ink-soft hover:text-ink"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) =>
          void onPhoto(event)
        }
      />
    </div>
  );
}

function BrandLogo({
  brand,
  small,
}: {
  brand: {
    logo_url: string;
    brand_name: string;
  };
  small?: boolean;
}) {
  const className = small
    ? 'h-8 w-auto max-w-[120px]'
    : 'h-9 w-auto max-w-[150px]';

  return brand.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo_url}
      alt={brand.brand_name}
      className={`${className} object-contain`}
    />
  ) : (
    <span
      className={`grid ${
        small ? 'h-8 w-8' : 'h-9 w-9'
      } place-items-center rounded-xl accent-bar text-white font-semibold`}
    >
      {(brand.brand_name || 'H').charAt(0)}
    </span>
  );
}

/** Réduit une image en data URL JPEG compressée. */
function compressImage(
  file: File,
  maxSize: number,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(
        1,
        maxSize /
          Math.max(image.width, image.height),
      );

      const width = Math.round(
        image.width * scale,
      );

      const height = Math.round(
        image.height * scale,
      );

      const canvas =
        document.createElement('canvas');

      canvas.width = width;
      canvas.height = height;

      const context =
        canvas.getContext('2d');

      if (!context) {
        reject(new Error('no ctx'));
        return;
      }

      context.drawImage(
        image,
        0,
        0,
        width,
        height,
      );

      resolve(
        canvas.toDataURL(
          'image/jpeg',
          quality,
        ),
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load error'));
    };

    image.src = url;
  });
}

// -----------------------------------------------------------------------------
// Tableau de bord
// -----------------------------------------------------------------------------

function ActionCard({
  tone,
  title,
  desc,
  icon,
  onClick,
}: {
  tone: 'rose' | 'green' | 'blue' | 'amber';
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const background =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-500'
      : tone === 'green'
        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-600'
          : 'bg-blue-50 text-blue-500';

  const arrow =
    tone === 'rose'
      ? 'text-rose-500'
      : tone === 'green'
        ? 'text-[var(--primary)]'
        : tone === 'amber'
          ? 'text-amber-600'
          : 'text-blue-500';

  return (
    <button
      onClick={onClick}
      className="card p-4 text-left flex flex-col active:scale-[0.99] transition-transform min-h-[150px]"
    >
      <div
        className={`h-12 w-12 rounded-2xl grid place-items-center ${background}`}
      >
        {icon}
      </div>

      <div className="mt-3 font-semibold leading-tight">
        {title}
      </div>

      <div className="mt-1 text-xs text-ink-soft flex-1">
        {desc}
      </div>

      <div className={`mt-2 ${arrow}`}>
        →
      </div>
    </button>
  );
}

function RecentRow({
  r,
}: {
  r: RecentAction;
}) {
  const tone =
    r.kind === 'label'
      ? 'bg-rose-50 text-rose-500'
      : r.kind === 'stock'
        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
        : 'bg-blue-50 text-blue-500';

  const icon =
    r.kind === 'label' ? (
      <IconPrinter />
    ) : r.kind === 'stock' ? (
      <IconBoxDown />
    ) : (
      <IconBoxPlus />
    );

  return (
    <div className="p-3 flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">
          {r.title}
        </div>

        {r.sub && (
          <div className="text-xs text-ink-soft truncate">
            {r.sub}
          </div>
        )}
      </div>

      {r.at && (
        <div className="text-xs text-ink-soft tabular-nums">
          {r.at}
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-1 ${
        active
          ? 'text-[var(--primary)]'
          : 'text-ink-soft'
      }`}
    >
      {icon}

      <span className="text-[10px]">
        {label}
      </span>
    </button>
  );
}

// -----------------------------------------------------------------------------
// Icônes
// -----------------------------------------------------------------------------

const sv = (
  content: React.ReactNode,
  size = 22,
) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {content}
  </svg>
);

function IconPrinter() {
  return sv(
    <>
      <path d="M6 9V3h12v6" />
      <rect
        x="4"
        y="9"
        width="16"
        height="8"
        rx="2"
      />
      <path d="M8 17h8v4H8z" />
    </>,
  );
}

function IconBoxDown() {
  return sv(
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v6" />
      <path d="M9.5 16.5L12 19l2.5-2.5" />
    </>,
  );
}

function IconBoxPlus() {
  return sv(
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 12v6M9 15h6" />
    </>,
  );
}

function IconBarcode({
  big,
}: {
  big?: boolean;
}) {
  return sv(
    <path d="M4 6v12M7 6v12M10 6v12M13 6v12M16 6v12M19 6v12" />,
    big ? 44 : 22,
  );
}

function IconHome() {
  return sv(
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>,
  );
}

function IconClock() {
  return sv(
    <>
      <circle
        cx="12"
        cy="12"
        r="9"
      />
      <path d="M12 7v5l3 2" />
    </>,
  );
}

function IconBox() {
  return sv(
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>,
  );
}

function IconClipboard() {
  return sv(
    <>
      <rect
        x="8"
        y="3"
        width="8"
        height="4"
        rx="1"
      />
      <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <path d="M8 12h6M8 16h4" />
    </>,
  );
}

function IconBoxes() {
  return sv(
    <>
      <rect
        x="3"
        y="13"
        width="8"
        height="8"
        rx="1"
      />
      <rect
        x="13"
        y="13"
        width="8"
        height="8"
        rx="1"
      />
      <rect
        x="8"
        y="3"
        width="8"
        height="8"
        rx="1"
      />
    </>,
  );
}

function IconGear() {
  return sv(
    <>
      <circle
        cx="12"
        cy="12"
        r="3"
      />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>,
  );
}
