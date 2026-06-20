type Tone = 'soft' | 'sage' | 'warning' | 'danger' | 'success' | 'neutral';

export default function Badge({
  tone = 'soft',
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const cls = {
    soft:    'bg-sage-soft text-sage-deep',
    sage:    'bg-sage text-white',
    warning: 'bg-warning/10 text-warning',
    danger:  'bg-danger/10 text-danger',
    success: 'bg-success/10 text-success',
    neutral: 'bg-bg text-ink-soft border border-border',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
