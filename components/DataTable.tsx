interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T>({
  columns, rows, rowKey, emptyLabel = 'Aucune donnée', onRowClick,
}: Props<T>) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg text-ink-soft text-xs uppercase">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 ${c.align === 'right' ? 'text-right' :
                  c.align === 'center' ? 'text-center' : 'text-left'}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-soft">
                {emptyLabel}
              </td>
            </tr>
          ) : rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={`border-t border-border ${onRowClick ? 'cursor-pointer hover:bg-bg/60' : ''}`}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-3 ${c.align === 'right' ? 'text-right' :
                    c.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
