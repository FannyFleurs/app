'use client';

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
    >
      Imprimer / exporter en PDF
    </button>
  );
}
