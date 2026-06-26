import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import PageHeader from '@/components/PageHeader';
import Icon, { type IconName } from '@/components/Icon';

export const dynamic = 'force-dynamic';

interface Tile {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  perm?: 'pos.use' | 'fiscal.export' | 'fiscal.audit' | 'settings.write' | 'settings.read' | 'users.read';
}

const TILES: Tile[] = [
  {
    href: '/pos-settings',
    label: 'Paramètres caisse',
    description: 'Apparence, thème, taille des tuiles, fond de caisse, fidélité, modes de règlement.',
    icon: 'pos-settings',
    perm: 'pos.use',
  },
  {
    href: '/settings/access',
    label: 'Gestion d\'accès',
    description: 'Activer ou masquer chaque entrée de la sidebar pour cette organisation.',
    icon: 'users',
    perm: 'settings.write',
  },
  {
    href: '/users',
    label: 'Gestion utilisateurs',
    description: 'Comptes, rôles (Admin / Responsable / Vendeur) et codes PIN de connexion.',
    icon: 'users',
    perm: 'users.read',
  },
  {
    href: '/settings/company',
    label: 'Société & boutiques',
    description: 'Identité légale, adresses, boutiques, caisses et taux de TVA.',
    icon: 'settings',
    perm: 'settings.read',
  },
  {
    href: '/exports',
    label: 'Exports comptables',
    description: 'Génération des paquets pour l\'expert-comptable, plan comptable.',
    icon: 'exports',
    perm: 'fiscal.export',
  },
  {
    href: '/fiscal',
    label: 'Conformité fiscale',
    description: 'Cœur d\'inaltérabilité, vérification de la chaîne, événements scellés.',
    icon: 'fiscal',
    perm: 'fiscal.audit',
  },
];

export default async function SettingsHub() {
  const user = (await readSessionFromCookie())!;
  const tiles = TILES.filter((t) => !t.perm || hasPermission(user.role, t.perm));

  return (
    <div className="p-8 space-y-5 max-w-5xl">
      <PageHeader
        title="Paramètres"
        subtitle="Configurez votre organisation. Chaque tuile ouvre une section dédiée."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="card p-5 hover:shadow-md hover:border-gray-300 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-deep">
                <Icon name={t.icon} size={26} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{t.label}</div>
                <div className="mt-1 text-sm text-ink-soft">{t.description}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
