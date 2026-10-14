'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Aperçu d'un PDF généré côté serveur, dans une modale de la page — jamais
 * une navigation vers l'URL du serveur (voir lib/ui/download-file.ts : dans
 * l'app native, un lien classique vers une route authentifiée échappe vers
 * Safari, qui n'a pas la session de la WebView embarquée, et perd la
 * facture en route d'erreur). Le PDF est récupéré par fetch depuis la page
 * — session valide —, affiché dans un iframe ; le bouton Imprimer déclenche
 * l'impression du contenu de l'iframe, plus fiable qu'une barre d'outils de
 * lecteur PDF intégrée (absente dans certaines WebView).
 */
export default function PdfPreviewModal({ url, title, filename, onClose }: {
  url: string;
  title: string;
  filename: string;
  onClose: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) { if (active) setError(true); return; }
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        created = objUrl;
        if (active) setObjectUrl(objUrl); else URL.revokeObjectURL(objUrl);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl h-[85vh] p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            {objectUrl && (
              <>
                <button
                  onClick={() => iframeRef.current?.contentWindow?.print()}
                  className="btn-soft text-xs"
                >
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
