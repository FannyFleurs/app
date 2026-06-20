interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon = '✿', title, description, action }: Props) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sage-soft text-sage-deep text-xl">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-soft max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
