'use client';

import Link from 'next/link';

export interface OnboardingStatus {
  has_category: boolean;
  has_product: boolean;
  has_customer: boolean;
  has_sale: boolean;
  first_time: boolean;
}

/**
 * Écran de bienvenue à la première connexion en caisse (aucune vente encore
 * encaissée). Il remplace l'ouverture directe de la modale « fond de caisse »
 * par une liste d'étapes à valider. Non bloquant : on peut ouvrir la caisse à
 * tout moment. La modale de fond de caisse arrive à l'étape « première vente ».
 */
export default function WelcomeOnboarding({
  status,
  storeName,
  onOpenCaisse,
}: {
  status: OnboardingStatus;
  storeName?: string;
  onOpenCaisse: () => void;
}) {
  const steps = [
    {
      done: status.has_category,
      title: 'Créer une catégorie',
      desc: 'Organisez vos produits (ex. Bouquets, Plantes).',
      href: '/categories',
    },
    {
      done: status.has_product,
      title: 'Créer un produit',
      desc: 'Ajoutez vos premiers articles à vendre.',
      href: '/products',
    },
    {
      done: status.has_customer,
      title: 'Créer un client',
      desc: 'Pour la fidélité, les factures et le suivi.',
      href: '/customers',
    },
  ];

  return (
    <div className="h-full overflow-y-auto grid place-items-center px-4 py-8">
      <div className="card p-6 sm:p-8 max-w-lg w-full">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
            ✦
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bienvenue sur votre nouveau logiciel HelloPos
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {storeName ? `${storeName} · ` : ''}
            Quelques étapes pour bien démarrer. Vous pouvez ouvrir la caisse à tout moment.
          </p>
        </div>

        <ol className="mt-6 space-y-2">
          {steps.map((s, i) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-gray-50 transition-colors"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    s.done ? 'bg-success/15 text-success' : 'accent-bar text-white'
                  }`}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block font-medium ${s.done ? 'text-ink-soft line-through' : ''}`}>
                    {s.title}
                  </span>
                  <span className="block text-xs text-ink-soft">{s.desc}</span>
                </span>
                <span className="ml-auto text-ink-soft">›</span>
              </Link>
            </li>
          ))}

          <li>
            <button
              onClick={onOpenCaisse}
              className="w-full flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold accent-bar text-white">
                4
              </span>
              <span className="min-w-0">
                <span className="block font-medium">Ouvrir la caisse et faire une première vente</span>
                <span className="block text-xs text-ink-soft">
                  On vous demandera de déterminer votre fond de caisse.
                </span>
              </span>
              <span className="ml-auto text-ink-soft">›</span>
            </button>
          </li>
        </ol>

        <button onClick={onOpenCaisse} className="btn-primary mt-6 w-full h-12 text-base">
          Ouvrir ma caisse
        </button>
      </div>
    </div>
  );
}
