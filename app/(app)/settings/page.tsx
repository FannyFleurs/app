import Icon from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default function SettingsHomePage() {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="text-center max-w-md">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-deep">
          <Icon name="settings" size={32} />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Paramètres</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Sélectionnez une section dans la barre de gauche pour afficher son contenu ici.
        </p>
      </div>
    </div>
  );
}
