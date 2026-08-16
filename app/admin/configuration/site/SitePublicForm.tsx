'use client';

import { useState } from 'react';
import { savePlatformConfig } from '../_shared';

/**
 * Interrupteur de publication du site public.
 *
 * L'enregistrement est immédiat : au clic, le réglage part en base et le site
 * bascule à la requête suivante — aucun redéploiement, aucun délai de cache
 * (le gabarit du site est rendu à la demande).
 */
export default function SitePublicForm({
  initial,
  siteUrl,
}: {
  initial: boolean;
  siteUrl: string;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function toggle(next: boolean) {
    if (busy || next === on) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await savePlatformConfig({ site_public: next });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOn(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-5">
        <div>
          <h2 className="font-semibold">Site public</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Contrôle ce que voit un visiteur de {siteUrl}. Les espaces
            applicatifs — caisse, back-office, écrans, PDA, console
            d’administration — ne sont jamais concernés par ce réglage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            role="radiogroup"
            aria-label="État du site public"
            className="inline-flex rounded-xl border border-border bg-gray-50 p-1"
          >
            {[
              { value: false, label: 'Off' },
              { value: true, label: 'On' },
            ].map((opt) => {
              const active = on === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => toggle(opt.value)}
                  className={`min-w-[5rem] rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? opt.value
                        ? 'bg-success text-white'
                        : 'bg-ink text-white'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <p className="text-sm">
            {busy ? (
              <span className="text-ink-soft">Enregistrement…</span>
            ) : on ? (
              <>
                <span className="font-medium text-success">Le site est en ligne.</span>{' '}
                <span className="text-ink-soft">Toutes les pages sont accessibles et indexables.</span>
              </>
            ) : (
              <>
                <span className="font-medium">Le site n’est pas publié.</span>{' '}
                <span className="text-ink-soft">Seule la page d’attente est en ligne.</span>
              </>
            )}
          </p>
        </div>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {saved && (
          <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            ✓ {on ? 'Site publié.' : 'Site dépublié.'} Le changement est déjà actif.
          </div>
        )}

        <div className="rounded-xl border border-border p-4 text-sm">
          <p className="font-medium">Ce que ça change</p>
          <ul className="mt-2 space-y-1.5 text-ink-soft">
            <li>
              <strong className="text-ink">On</strong> — l’accueil, les fonctionnalités, les tarifs, le
              matériel, les pages métier, les ressources et le contact sont servis normalement. Le
              plan du site est de nouveau annoncé aux moteurs de recherche, et la création de
              compte en ligne est ouverte.
            </li>
            <li>
              <strong className="text-ink">Off</strong> — la racine du domaine affiche la page
              d’attente, toutes les autres adresses y ramènent, la création de compte est fermée et
              le plan du site ne liste plus aucune page.
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <a className="text-accent-text underline" href="/indisponible" target="_blank" rel="noreferrer">
            Voir la page d’attente
          </a>
          <a className="text-accent-text underline" href={siteUrl} target="_blank" rel="noreferrer">
            Voir le site public
          </a>
        </div>
      </section>
    </div>
  );
}
