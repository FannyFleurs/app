'use client';

interface Props {
  receipt: { id: string; number: string };
  onClose: () => void;
}

export default function ReceiptPreviewModal({ receipt, onClose }: Props) {
  const pdfUrl = `/api/receipts/${receipt.id}/pdf`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-2xl w-full p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ticket {receipt.number}</h2>
            <p className="text-sm text-ink-soft">Vente validée et scellée fiscalement.</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-primary">Imprimer / PDF</a>
          <a href={pdfUrl} download className="btn-soft">Télécharger</a>
          <button onClick={onClose} className="btn-ghost">Nouvelle vente</button>
        </div>
        <div className="mt-4 h-[420px] rounded-xl border border-border overflow-hidden">
          <iframe src={pdfUrl} className="w-full h-full" title="Ticket" />
        </div>
      </div>
    </div>
  );
}
