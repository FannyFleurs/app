'use client';

import { useState } from 'react';

/**
 * Bouton "Ajouter à Apple Wallet" sur la fiche client. Telecharge le
 * .pkpass genere par /api/customers/[id]/wallet/apple.
 * L'iPhone/Mac ouvre alors Apple Wallet directement au clic.
 */
export default function WalletActions({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addToWallet() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/customers/${customerId}/wallet/apple`, {
        method: 'POST',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(prettyError(j.error, j.message));
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      // Sur iPhone/Mac, ouvrir directement Wallet ; sur desktop non-Mac,
      // télécharge simplement le fichier.
      const a = document.createElement('a');
      a.href = url;
      a.download = `fidelite.pkpass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Carte fidélité Apple Wallet</div>
          <div className="text-xs text-ink-soft">
            Génère un pass mis à jour à chaque passage caisse.
          </div>
        </div>
        <button
          onClick={() => void addToWallet()}
          disabled={busy}
          className="btn-primary h-11 px-5 text-sm font-semibold"
        >
          {busy ? 'Génération…' : '🍎 Ajouter à Apple Wallet'}
        </button>
      </div>
      {err && (
        <div className="rounded-lg bg-warning/10 text-warning text-xs px-3 py-2">{err}</div>
      )}
    </div>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'WALLET_NOT_CONFIGURED':
      return 'Apple Wallet non configuré côté serveur. Ajoutez APPLE_WALLET_CERT_P12_B64, APPLE_WALLET_CERT_PASSWORD, APPLE_WALLET_WWDR_PEM_B64.';
    case 'WALLET_DISABLED':
      return 'Activez la carte Wallet dans Paramètres → Fidélité.';
    case 'WALLET_MISSING_IDS':
      return 'Pass Type ID et Team ID à renseigner dans Paramètres → Fidélité.';
    default:
      return message ?? code ?? 'Erreur inattendue';
  }
}
