'use client';

/**
 * Frontière d'erreur RACINE : remplace le layout complet (html/body) si
 * l'erreur survient dans le layout racine lui-même. Styles en ligne car
 * globals.css n'est pas garanti chargé à ce niveau.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#ECEEF1',
          color: '#1A1D22',
        }}
      >
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,.1)',
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Une erreur est survenue</h1>
            <p style={{ fontSize: 14, color: '#5b6472', marginTop: 8, lineHeight: 1.5 }}>
              L&apos;application a rencontré un problème inattendu. Réessaie ou recharge la page.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 24,
                background: '#556B3E',
                color: '#fff',
                border: 0,
                borderRadius: 10,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
            {error?.digest && (
              <p style={{ marginTop: 16, fontSize: 11, color: '#8a93a0' }}>Réf. {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
