interface Props {
  title: string;
  subtitle?: string;
  badge?: { label: string; tone?: 'soft' | 'warning' | 'success' };
  actions?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, badge, actions }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
        {subtitle && <p className="mt-1 text-sm text-ink-soft max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
