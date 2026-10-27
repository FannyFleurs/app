'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

interface Failure {
  id: string;
  created_at: string;
  action: 'order_intake.rejected' | 'order_intake.auto_checkout_failed';
  payload: Record<string, unknown>;
}

/** Motif technique -> explication lisible. Un motif non listé (erreur interne
 *  imprévue) s'affiche tel quel, préfixé, plutôt que de disparaître. */
const REASON_LABELS: Record<string, string> = {
  VALIDATION_ERROR: 'Données de commande invalides (format inattendu envoyé par l\'app commande)',
  UNKNOWN_BOUTIQUE: 'Boutique non reconnue — absente du mapping (Paramètres → Intégration commande)',
  STORE_NOT_FOUND: 'Boutique mappée mais introuvable ou désactivée',
  NO_USER: 'Aucun utilisateur dans l\'organisation pour porter la commande',
  NO_ACTIVE_REGISTER: 'Aucune caisse active dans cette boutique',
};

function reasonLabel(reason: unknown): string {
  const r = typeof reason === 'string' ? reason : 'Erreur inconnue';
  return REASON_LABELS[r] ?? `Erreur interne : ${r}`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

export default function CommandesRejeteesClient() {
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/order-intake-failures')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setFailures(j?.failures ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Commandes rejetées"
        subtitle="Commandes de l'app commande (WEB / OGF) n'ayant pas pu s'intégrer aux ventes — l'app commande confirme toujours au client, quelle que soit la réponse de HelloPos : c'est la seule trace de ces échecs."
      />

      {loading ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : !failures || failures.length === 0 ? (
        <EmptyState
          title="Aucun rejet récent"
          description="Aucune commande externe rejetée ou en échec d'encaissement automatique sur les 200 derniers événements."
        />
      ) : (
        <div className="card divide-y divide-border">
          {failures.map((f) => {
            const p = f.payload;
            const isAutoCheckout = f.action === 'order_intake.auto_checkout_failed';
            const boutique = str(p.boutique);
            const externalRef = str(p.external_ref);
            const source = str(p.source);
            const date = new Date(f.created_at);
            return (
              <div key={f.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium">
                    {isAutoCheckout
                      ? 'Commande reçue, mais encaissement automatique échoué'
                      : 'Commande rejetée avant enregistrement'}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {date.toLocaleDateString('fr-FR')} à {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-danger">{reasonLabel(p.reason)}</p>
                <p className="text-xs text-ink-soft">
                  {[
                    boutique && `Boutique : ${boutique}`,
                    source && `Source : ${source}`,
                    externalRef && `Référence : ${externalRef}`,
                  ].filter(Boolean).join(' · ') || 'Aucun détail supplémentaire disponible.'}
                </p>
                {isAutoCheckout && (
                  <p className="text-xs text-ink-soft">
                    La commande existe bien, en attente d'encaissement — rappelez-la en caisse pour l'encaisser manuellement.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
