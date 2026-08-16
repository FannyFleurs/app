/**
 * Iconographie filaire du site.
 *
 * Un seul jeu, un seul style : trait de 1,4 px, extrémités arrondies, grille
 * 24. Les icônes sont décoratives — le sens est toujours porté par le texte —
 * donc `aria-hidden` par défaut.
 */

const PATHS: Record<string, React.ReactNode> = {
  /* Vendre */
  cart: <><path d="M3 5h2.2l1.9 10.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20 8H6.4" /><circle cx="9.5" cy="20" r="1.1" /><circle cx="17" cy="20" r="1.1" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21Z" /><path d="M9.5 8h5M9.5 12h5" /></>,
  refund: <><path d="M4 9h11a4.5 4.5 0 0 1 0 9H8" /><path d="m7.5 5.5-3.5 3.5 3.5 3.5" /></>,
  gift: <><rect x="3.5" y="9" width="17" height="11.5" rx="1.6" /><path d="M3.5 13.5h17M12 9v11.5" /><path d="M12 9S10.5 4 8 4a2 2 0 0 0 0 5h4Zm0 0s1.5-5 4-5a2 2 0 0 1 0 5h-4Z" /></>,
  return: <><path d="M20 15H9a4.5 4.5 0 0 1 0-9h7" /><path d="m16.5 2.5 3.5 3.5-3.5 3.5" /></>,
  /* Préparer */
  orders: <><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M9 3.5V2m6 1.5V2M8.5 9.5h7M8.5 13.5h7M8.5 17h4" /></>,
  pickup: <><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" /><path d="M4 8.5 12 13l8-4.5M12 13v7" /></>,
  truck: <><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 10h4l3 3v2.5h-7z" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></>,
  workshop: <><rect x="3" y="4" width="18" height="12.5" rx="2" /><path d="M9 20.5h6M12 16.5v4M7.5 8.5h4M7.5 12h7" /></>,
  /* Gérer */
  box: <><path d="M20.5 8.5v7L12 20.5 3.5 15.5v-7L12 3.5Z" /><path d="M3.5 8.5 12 13l8.5-4.5M12 13v7.5" /></>,
  inventory: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /><path d="m6.5 4.8 1.4 1.7L6.5 8.2M6.5 10.3l1.4 1.7-1.4 1.7M6.5 15.8l1.4 1.7-1.4 1.7" /></>,
  tag: <><path d="M11 3.5H20.5V13L12 21.5 3 12.5Z" /><circle cx="16.7" cy="7.3" r="1.3" /></>,
  supplier: <><path d="M3.5 7.5h10v9h-10z" /><path d="M13.5 11h3.7l3.3 3v2.5h-7z" /><circle cx="7" cy="18.5" r="1.4" /><circle cx="17" cy="18.5" r="1.4" /><path d="M6 4.5h6" /></>,
  /* Fidéliser */
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 20c.7-3.4 3.1-5.2 6-5.2s5.3 1.8 6 5.2" /><path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 19.6c-.3-2-1-3.5-2.1-4.6" /></>,
  loyalty: <><path d="M12 20.2s-7.2-4.1-7.2-9A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 7.2 2.6c0 4.9-7.2 9-7.2 9Z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 10h18M16.5 14.5h2" /></>,
  /* Piloter */
  chart: <><path d="M4 20V9M10 20V4M16 20v-7M22 20H2" /></>,
  report: <><rect x="4.5" y="3" width="15" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.2a4 4 0 0 1 8 0V10" /></>,
  ledger: <><path d="M5 3.5h11l3 3V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20Z" /><path d="M15.5 3.5V7H19M8.5 12h7M8.5 16h4" /></>,
  /* Grandir */
  stores: <><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5 5 4h14l2 5.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" /><path d="M10 20v-5.5h4V20" /></>,
  team: <><circle cx="12" cy="7.5" r="3" /><path d="M6 20c.6-3.2 2.9-5 6-5s5.4 1.8 6 5" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M15.5 12v2.2" /></>,
  transfer: <><path d="M4 8.5h13m-3-3 3 3-3 3" /><path d="M20 15.5H7m3-3-3 3 3 3" /></>,
  /* Matériel */
  tablet: <><rect x="5" y="2.5" width="14" height="19" rx="2.2" /><path d="M11 18.8h2" /></>,
  printer: <><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="7.5" rx="1.8" /><path d="M7 14h10v6.5H7z" /></>,
  drawer: <><rect x="3" y="7.5" width="18" height="11" rx="1.8" /><path d="M3 12.5h18M10 15.5h4" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></>,
  label: <><rect x="2.5" y="6" width="19" height="12" rx="1.8" /><path d="M6.5 9.5v5M9 9.5v5M11.5 9.5v5M15 9.5v5M17.5 9.5v5" /></>,
  pda: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M9 6h6M9 9.5h6M10.5 18.5h3" /></>,
  screen: <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 20.5h8M12 17v3.5" /></>,
  card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" /><path d="M2.5 10h19M6 14.5h4" /></>,
  /* Interface */
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  arrow: <><path d="M4 12h15" /><path d="m13.5 6.5 6 5.5-6 5.5" /></>,
  play: <path d="M8 5.5 18.5 12 8 18.5Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 7 8.5-7" /></>,
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />,
  shield: <><path d="M12 3.2 20 6v5.5c0 4.7-3.3 7.8-8 9.3-4.7-1.5-8-4.6-8-9.3V6Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.6 2.6M15.4 15.4 18 18M18 6l-2.6 2.6M8.6 15.4 6 18" />,
};

export type IconKey = keyof typeof PATHS | string;

export function Icon({
  name,
  size = 22,
  className,
  title,
}: {
  name: IconKey;
  size?: number;
  className?: string;
  title?: string;
}) {
  const d = PATHS[name] ?? PATHS.spark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {d}
    </svg>
  );
}
