import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import AppShell, { type SubscriptionInfo } from '@/components/AppShell';
import { resolveEffectivePermissions } from '@/lib/auth/permissions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Mode back-office : injecte par le middleware sur le sous-domaine bo.
  // ou apres visite de /bo (cookie webpos_bo=1). Adapte la sidebar (menu
  // complet), masque /caisse partout et donne acces a certaines pages
  // reservees (Societe & boutiques).
  const backOffice = headers().get('x-webpos-bo') === '1';

  const user = await readSessionFromCookie();
  if (!user) redirect(backOffice ? '/bo/login' : '/login');

  // Gate d'accès facturation : une org "incomplete" (paiement non
  // finalisé) ou dont l'abonnement est résilié/expiré n'accède pas à
  // l'app. Silencieux si migration 0030 absente. super_admin exempté.
  if (user.role !== 'super_admin') {
    try {
      const gate = await query<{ onboarding_complete: boolean; status: string | null }>(
        `SELECT o.onboarding_complete, s.status
           FROM organizations o
           LEFT JOIN subscriptions s ON s.organization_id = o.id
          WHERE o.id = $1`,
        [user.organizationId],
      );
      const g = gate.rows[0];
      if (g && g.onboarding_complete === false) {
        return <BillingBlock reason="incomplete" />;
      }
      if (g && (g.status === 'cancelled' || g.status === 'expired')) {
        return <BillingBlock reason="cancelled" />;
      }
    } catch { /* migration 0030 absente : pas de gate */ }
  }

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(rows[0]?.value ?? null);

  // Charge le plan / la date d'échéance (silencieux si migration 0010 absente).
  let subscription: SubscriptionInfo | null = null;
  try {
    const subRes = await query<{
      plan: string; trial_ends_at: string | null;
      sub_plan: string | null; sub_status: string | null;
      sub_period_end: string | null;
      cancel_at_period_end: boolean | null;
    }>(
      `SELECT o.plan, o.trial_ends_at,
              s.plan AS sub_plan, s.status AS sub_status,
              s.current_period_end AS sub_period_end,
              s.cancel_at_period_end
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [user.organizationId],
    );
    const r = subRes.rows[0];
    if (r) {
      subscription = {
        plan: r.sub_plan ?? r.plan ?? 'trial',
        status: r.sub_status ?? 'active',
        period_end: r.sub_period_end ?? r.trial_ends_at,
        cancel_at_period_end: r.cancel_at_period_end ?? false,
      };
    }
  } catch { /* migration 0010 absente : on n'affiche pas la pastille */ }

  // Resout les permissions effectives (defauts role + overrides role +
  // overrides user) une seule fois par navigation, puis passe l'ensemble
  // au shell client. Ainsi la sidebar / topbar / overlay "Toutes les
  // pages" respectent les overrides configures dans /settings/permissions.
  const effectivePerms = await resolveEffectivePermissions(
    user.id, user.role, user.organizationId,
  );

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, role: user.role, email: user.email }}
      themeColor={ui.theme_color}
      colorScheme={ui.color_scheme}
      hiddenPaths={ui.hidden_sidebar_paths ?? []}
      autoLogoutMode={ui.auto_logout_mode}
      autoLogoutMinutes={ui.auto_logout_minutes}
      headerTabs={ui.header_tabs ?? []}
      subscription={subscription}
      permissions={Array.from(effectivePerms)}
      backOffice={backOffice}
    >
      {children}
    </AppShell>
  );
}

/** Écran de blocage : abonnement non finalisé ou résilié. */
function BillingBlock({ reason }: { reason: 'incomplete' | 'cancelled' }) {
  const isIncomplete = reason === 'incomplete';
  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-deep text-2xl">
          {isIncomplete ? '⏳' : '🔒'}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {isIncomplete ? 'Finalisez votre inscription' : 'Abonnement inactif'}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {isIncomplete
            ? 'Votre inscription n\'est pas terminée : ajoutez un moyen de paiement pour activer votre boutique (essai gratuit, aucun débit immédiat).'
            : 'Votre abonnement a été résilié ou a expiré. Réactivez-le pour retrouver l\'accès à votre caisse.'}
        </p>
        <a href="/setup" className="btn-primary mt-5 inline-flex">
          {isIncomplete ? 'Reprendre l\'inscription' : 'Réactiver mon abonnement'}
        </a>
        <p className="mt-3 text-xs text-ink-soft">
          Besoin d&apos;aide ? Contactez le support.
        </p>
      </div>
    </main>
  );
}
