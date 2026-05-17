'use client';

import { useState } from 'react';

export default function VerifyButton() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3">
      <button
        className="btn-soft text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch('/api/fiscal/verify');
          const j = await r.json();
          setResult(j.ok ? `Intégrité OK — ${j.inspected} événements vérifiés.` :
            `ALERTE : ${j.firstError?.reason} à l'index ${j.firstError?.index}`);
          setBusy(false);
        }}
      >
        Re-vérifier maintenant
      </button>
      {result && <div className="mt-2 text-xs text-ink-soft">{result}</div>}
    </div>
  );
}
