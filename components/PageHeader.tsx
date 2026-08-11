interface Props {
  title: string;
  subtitle?: string;
  badge?: { label: string; tone?: 'soft' | 'warning' | 'success' };
  actions?: React.ReactNode;
}

/**
 * En-tête de page compact : le titre situe, il n'a pas à occuper le tiers
 * supérieur de l'écran. Le sous-titre passe sur la même ligne que le titre
 * dès qu'il y a la place — c'est une ligne de hauteur gagnée sur chaque page.
 */
export default function PageHeader({ title, subtitle, badge, actions }: Props) {
  return (
    // `items-start` et non `items-center` : un bloc d'actions plus haut que le
    // titre (des champs de date en 40 px face à un titre de 28) recentrait le
    // titre vers le bas, et il ne démarrait plus à la même hauteur que sur les
    // pages sans actions.
    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge && (
            <span
              className={
                badge.tone === 'warning'
                  ? 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
                  : badge.tone === 'success'
                  ? 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                  : 'chip'
              }
            >
              {badge.label}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
