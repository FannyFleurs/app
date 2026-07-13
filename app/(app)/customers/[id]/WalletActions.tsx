'use client';

import { useState } from 'react';

interface Props {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
}

/**
 * Section "Carte fidelite Apple Wallet" toujours visible sur la fiche
 * client. Trois options :
 *   1. QR code affiche a l'ecran — le client scanne avec son iPhone
 *   2. Envoi SMS via lien sms: — ouvre iMessage prerempli
 *   3. Envoi email via lien mailto: — ouvre le client mail prerempli
 * Toutes reposent sur un lien signe /w/[token] (30j de validite) qui
 * livre le .pkpass sans authentification.
 */
export default function WalletActions({ customerId, customerEmail, customerPhone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<{ url: string; qr: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function openShareModal() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/customers/${customerId}/wallet/apple/link`, {
        method: 'POST',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(prettyError(j.error, j.message) + ` (HTTP ${r.status})`);
        return;
      }
      const data = await r.json() as { url: string; qr: string };
      if (!data.url) {
        setErr('Réponse serveur invalide');
        return;
      }
      setModal({ url: data.url, qr: data.qr ?? '' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[wallet.share]', e);
      setErr('Erreur : ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">🍎 Carte fidélité Apple Wallet</div>
          <div className="text-xs text-ink-soft mt-0.5">
            Le client l&apos;ajoute lui-même à son iPhone. Le solde
            se met à jour tout seul après chaque passage caisse.
          </div>
        </div>
        <button
          onClick={() => void openShareModal()}
          disabled={busy}
          className="btn-primary h-11 px-5 text-sm font-semibold w-full"
        >
          {busy ? 'Génération…' : '📱 Partager la carte'}
        </button>
        {err && (
          <div className="rounded-lg bg-warning/10 text-warning text-xs px-3 py-2">{err}</div>
        )}
      </div>

      {modal && (
        <ShareModal
          url={modal.url}
          qr={modal.qr}
          email={customerEmail}
          phone={customerPhone}
          copied={copied}
          onCopy={async () => {
            try { await navigator.clipboard?.writeText(modal.url); } catch {}
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function ShareModal({
  url, qr, email, phone, copied, onCopy, onClose,
}: {
  url: string; qr: string;
  email: string | null; phone: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const smsBody = encodeURIComponent(
    `Bonjour ! Voici votre carte de fidélité — ajoutez-la à Apple Wallet en un tap : ${url}`,
  );
  const emailSubject = encodeURIComponent('Votre carte fidélité Apple Wallet');
  const emailBody = encodeURIComponent(
    `Bonjour,

Voici votre carte de fidélité. Ouvrez le lien ci-dessous sur votre iPhone pour l'ajouter à Apple Wallet en un tap :

${url}

Le solde se met à jour automatiquement après chaque passage en caisse.

À bientôt !`,
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">Partager la carte fidélité</h3>
            <p className="text-xs text-ink-soft mt-1">
              Le client scanne, ou vous lui envoyez le lien.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100"
          >✕</button>
        </div>

        {/* QR code — le client le scanne avec l'appareil photo iPhone */}
        <div className="rounded-2xl bg-white border border-border p-4 grid place-items-center">
          {qr ? (
            <div
              className="w-56 h-56 [&_svg]:w-full [&_svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <div className="w-56 h-56 grid place-items-center text-xs text-ink-soft text-center px-4">
              QR indisponible — utilisez le lien ci-dessous.
            </div>
          )}
          <p className="mt-3 text-xs text-ink-soft text-center max-w-[220px]">
            Ouvrez l&apos;appareil photo iPhone du client et pointez-le vers ce QR.
          </p>
        </div>

        {/* Actions d'envoi */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {phone ? (
            <a
              href={`sms:${phone}&body=${smsBody}`}
              className="btn-soft h-12 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              💬 SMS
            </a>
          ) : (
            <button
              disabled
              className="btn-soft h-12 text-sm font-medium opacity-40 inline-flex items-center justify-center gap-2"
              title="Pas de numéro renseigné"
            >
              💬 SMS
            </button>
          )}
          {email ? (
            <a
              href={`mailto:${email}?subject=${emailSubject}&body=${emailBody}`}
              className="btn-soft h-12 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              ✉️ Email
            </a>
          ) : (
            <button
              disabled
              className="btn-soft h-12 text-sm font-medium opacity-40 inline-flex items-center justify-center gap-2"
              title="Pas d'email renseigné"
            >
              ✉️ Email
            </button>
          )}
        </div>

        {/* Copier le lien */}
        <button
          onClick={onCopy}
          className="mt-2 w-full h-12 rounded-xl border border-border bg-white text-sm font-medium hover:bg-gray-50 inline-flex items-center justify-center gap-2"
        >
          {copied ? '✓ Lien copié' : '🔗 Copier le lien'}
        </button>

        <div className="mt-3 text-[11px] text-ink-soft break-all font-mono bg-gray-50 rounded-lg p-2 border border-border">
          {url}
        </div>

        <p className="mt-3 text-xs text-ink-soft leading-relaxed">
          Le lien reste valide 30 jours. À l&apos;ouverture sur iPhone,
          Apple Wallet propose directement d&apos;ajouter la carte.
        </p>
      </div>
    </div>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Session expirée. Reconnectez-vous.';
    case 'FORBIDDEN':
      return 'Permission insuffisante.';
    case 'WALLET_NOT_CONFIGURED':
      return 'Apple Wallet non configuré côté serveur.';
    case 'WALLET_DISABLED':
      return 'Activez la carte Wallet dans Paramètres → Fidélité.';
    case 'WALLET_MISSING_IDS':
      return 'Pass Type ID + Team ID à renseigner dans Paramètres → Fidélité.';
    case 'CUSTOMER_NOT_FOUND':
      return 'Client introuvable dans votre organisation.';
    default:
      return message ?? code ?? 'Erreur inattendue';
  }
}
