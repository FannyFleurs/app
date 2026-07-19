import ConfigSubNav from './ConfigSubNav';

export const dynamic = 'force-dynamic';

/**
 * Configuration plateforme : découpée en sous-pages (sous-menu) —
 * Marque & logos, Société & contact, Facturation Stripe.
 */
export default function ConfigurationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Configuration</h1>
      <p className="text-sm text-ink-soft mb-4">
        Branding du logiciel, identité de la société éditrice et facturation SaaS.
      </p>
      <ConfigSubNav />
      {children}
    </div>
  );
}
