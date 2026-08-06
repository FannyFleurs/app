/**
 * Fond décoratif de la grille de caisse.
 *
 * Une caisse passe ses journées ouverte sur cet écran ; un aplat blanc intégral
 * est fatigant et un peu froid. On pose donc un dégradé très léger et un
 * paysage végétal en bas de panneau — assez présent pour habiter l'espace vide
 * sous les tuiles, assez discret pour ne jamais concurrencer les produits.
 *
 * Tout est tiré de `--primary` : le fond suit la couleur d'accent choisie par
 * la boutique au lieu d'imposer un vert. Purement ornemental, donc masqué aux
 * lecteurs d'écran et transparent aux clics.
 */
export default function PosBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Voile général : à peine teinté, il réchauffe le blanc sans le griser. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--primary) 3%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--primary) 6%, transparent) 100%)',
        }}
      />
      <svg
        viewBox="0 0 1200 420"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 w-full h-[62%] min-h-[220px]"
        style={{ color: 'var(--primary)' }}
      >
        {/* Deux collines superposées : la profondeur vient de l'écart d'opacité,
            pas d'un trait de séparation qui ferait « graphique ». */}
        <path
          d="M0 250 C 180 196 340 252 560 226 S 980 160 1200 208 L1200 420 L0 420 Z"
          fill="currentColor" opacity="0.035"
        />
        <path
          d="M0 322 C 250 274 430 336 700 306 S 1040 274 1200 314 L1200 420 L0 420 Z"
          fill="currentColor" opacity="0.06"
        />

        {/* Feuillages posés sur les collines, à des échelles différentes pour
            éviter l'effet « motif répété ». */}
        <g fill="currentColor" opacity="0.075">
          <g transform="translate(120 300) rotate(-18) scale(1.15)">
            <path d="M0 0 C 26 -34 78 -34 104 0 C 78 34 26 34 0 0 Z" />
          </g>
          <g transform="translate(196 322) rotate(14) scale(0.8)">
            <path d="M0 0 C 26 -34 78 -34 104 0 C 78 34 26 34 0 0 Z" />
          </g>
        </g>
        <g fill="currentColor" opacity="0.07">
          <g transform="translate(940 286) rotate(-24) scale(1.5)">
            <path d="M0 0 C 26 -34 78 -34 104 0 C 78 34 26 34 0 0 Z" />
          </g>
          <g transform="translate(1058 336) rotate(8) scale(1.05)">
            <path d="M0 0 C 26 -34 78 -34 104 0 C 78 34 26 34 0 0 Z" />
          </g>
          <g transform="translate(880 350) rotate(26) scale(0.9)">
            <path d="M0 0 C 26 -34 78 -34 104 0 C 78 34 26 34 0 0 Z" />
          </g>
        </g>

        {/* Quelques tiges filaires : elles cassent la rondeur des feuilles. */}
        <g
          stroke="currentColor" strokeWidth="3" fill="none"
          strokeLinecap="round" opacity="0.08"
        >
          <path d="M470 420 C 470 360 452 330 424 308" />
          <path d="M470 372 C 496 356 512 336 516 312" />
          <path d="M700 420 C 700 372 714 348 740 330" />
        </g>
      </svg>
    </div>
  );
}
