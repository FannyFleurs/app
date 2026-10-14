'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Aperçu d'un PDF généré côté serveur, dans une modale de la page — jamais
 * une navigation vers l'URL du serveur (voir lib/ui/download-file.ts : dans
 * l'app native, un lien classique vers une route authentifiée échappe vers
 * Safari, qui n'a pas la session de la WebView embarquée, et perd la
 * facture en route d'erreur). Le PDF est récupéré par fetch depuis la page
 * — session valide —, affiché dans un iframe.
 *
 * Impression : `iframe.contentWindow.print()` suffit dans un navigateur
 * classique (testé : Chrome). Dans une WebView embarquée (app native), cette
 * API ne déclenche rien sans code natif dédié qu'on n'a pas ici — on passe
 * alors par le menu de partage du système (Web Share API, avec le PDF en
 * pièce jointe), qui propose "Imprimer" nativement (AirPrint) sans rien à
 * ajouter côté app. `canShare` sert à la fois de test de support ET de
 * détection : les navigateurs de bureau qui n'implémentent pas le partage de
 * fichiers gardent l'impression directe, qui y fonctionne très bien.
 */
export default function PdfPreviewModal({ url, title, filename, extraActions, onClose }: {
  url: string;
  title: string;
  filename: string;
  /** Ex. un bouton "Envoyer par email", propre à l'appelant (facture). */
  extraActions?: React.ReactNode;
  onClose: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) { if (active) setError(true); return; }
        const fetchedBlob = await res.blob();
        const objUrl = URL.createObjectURL(fetchedBlob);
        created = objUrl;
        if (active) { setObjectUrl(objUrl); setBlob(fetchedBlob); } else URL.revokeObjectURL(objUrl);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [url]);

  async function handlePrint() {
    if (blob) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); return; } catch { /* annulé ou échoué : repli ci-dessous */ }
      }
    }
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl h-[85vh] p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            {objectUrl && (
              <>
                {extraActions}
                <button onClick={() => void handlePrint()} className="btn-soft text-xs">
                  Imprimer
                </button>
                <a href={objectUrl} download={filename} className="btn-soft text-xs">Télécharger</a>
              </>
            )}
            <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Fermer">✕</button>
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-border overflow-hidden bg-gray-50">
          {error ? (
            <div className="h-full grid place-items-center text-sm text-danger px-4 text-center">
              PDF introuvable — réessayez.
            </div>
          ) : objectUrl ? (
            <iframe ref={iframeRef} src={objectUrl} className="w-full h-full" title={title} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-ink-soft">Chargement…</div>
          )}
        </div>
      </div>
    </div>
  );
}
