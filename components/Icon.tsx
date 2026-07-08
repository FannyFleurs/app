/**
 * Iconographie inline — pas de dépendance externe.
 * Tous les icônes sont en stroke style (heroicons outline), 24×24 par défaut.
 * Ajouter un icône : ajouter une entrée dans `ICONS` + le nom dans le type.
 */

export type IconName =
  | 'dashboard'
  | 'pos'
  | 'my-day'
  | 'pos-settings'
  | 'orders'
  | 'invoices'
  | 'customers'
  | 'loyalty'
  | 'products'
  | 'categories'
  | 'stock'
  | 'closures'
  | 'exports'
  | 'fiscal'
  | 'users'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'back'
  | 'check'
  | 'lock'
  | 'print'
  | 'cart'
  | 'star'
  | 'sync'
  | 'comment'
  | 'camera'
  | 'package'
  | 'truck'
  | 'pause'
  | 'card'
  | 'gift'
  | 'calendar'
  | 'menu'
  | 'plus'
  | 'minus'
  | 'close'
  | 'warning'
  | 'sparkle'
  | 'transfer';

const ICONS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  pos: (
    // Sac / panier de courses — represente l'action de vente en caisse.
    <>
      <path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    </>
  ),
  'my-day': (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  'pos-settings': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 7v1M12 16v1M7 12h1M16 12h1" />
    </>
  ),
  orders: (
    <>
      <path d="M3 7h18l-1.5 11a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7L3 7Z" />
      <path d="M8 7V5a4 4 0 1 1 8 0v2" />
    </>
  ),
  invoices: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  customers: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  loyalty: (
    // Carte bancaire (avoirs & cartes cadeaux) — rectangle avec bande
    // magnetique en haut et puce a gauche.
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 9h19" />
      <rect x="5.5" y="12" width="4" height="3" rx="0.5" />
      <path d="M14 15.5h4" />
    </>
  ),
  products: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  categories: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  stock: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5Z" />
      <path d="M3 17l9 5 9-5" />
      <path d="M3 12l9 5 9-5" />
    </>
  ),
  closures: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </>
  ),
  exports: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  fiscal: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      <path d="M9.5 12.5l2 2 3.5-4" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  'chevron-left':  <path d="M15 6l-6 6 6 6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  back:            <path d="M9 6l-6 6 6 6M3 12h18" />,
  check:           <path d="M5 12l4 4 10-10" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </>
  ),
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 12.3a2 2 0 0 0 2 1.7h8.2a2 2 0 0 0 2-1.6L21 8H6" />
    </>
  ),
  star: (
    <path d="M12 2.5l2.95 6 6.62.95-4.79 4.66 1.13 6.58L12 17.6l-5.91 3.1 1.13-6.58L2.43 9.45l6.62-.95L12 2.5Z" />
  ),
  sync: (
    <>
      <path d="M21 12a9 9 0 0 1-15.6 6.2L3 16" />
      <path d="M3 12a9 9 0 0 1 15.6-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </>
  ),
  comment: (
    <path d="M21 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.6 4.5 8.4 8.4 0 0 1-3.9-.9L3 20.5l1.4-5.5a8.4 8.4 0 0 1-.9-3.9 8.5 8.5 0 0 1 4.5-7.6 8.4 8.4 0 0 1 4-1h.5a8.5 8.5 0 0 1 8 8v.5Z" />
  ),
  camera: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  package: (
    <>
      <path d="M16.5 9.4 7.5 4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
      <path d="M12 22.08V12" />
    </>
  ),
  truck: (
    <>
      <path d="M14 18V6H1v12h13Z" />
      <path d="M14 8h5l3 3v7h-8" />
      <circle cx="5.5" cy="18.5" r="1.5" />
      <circle cx="18.5" cy="18.5" r="1.5" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M12 8v13" />
      <path d="M3 12h18" />
      <path d="M12 8c0-2 1.5-5 4-5s2 3-1 5h-3Z" />
      <path d="M12 8c0-2-1.5-5-4-5s-2 3 1 5h3Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4M16 2v4" />
    </>
  ),
  menu:    <path d="M4 7h16M4 12h16M4 17h16" />,
  plus:    <path d="M12 5v14M5 12h14" />,
  minus:   <path d="M5 12h14" />,
  close:   <path d="M6 6l12 12M6 18L18 6" />,
  warning: (
    <>
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.73 3h16.9a2 2 0 0 0 1.73-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  transfer: (
    // Deux fleches horizontales opposees — evoque un transfert entre
    // deux points (boutique A → boutique B et retour possible).
    <>
      <path d="M4 8h13" />
      <path d="M14 5l3 3-3 3" />
      <path d="M20 16H7" />
      <path d="M10 19l-3-3 3-3" />
    </>
  ),
};

export default function Icon({
  name,
  size = 22,
  className = '',
  strokeWidth = 1.6,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
