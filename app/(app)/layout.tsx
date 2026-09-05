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
import BillingBlock from '@/components/BillingBlock';
import { resolveEffectivePermissions } from '@/lib/auth/permissions';
import SupportBanner from '@/components/support/SupportBanner';
import SupportConsentGate from '@/components/support/SupportConsentGate';
import NoZoom from '@/components/NoZoom';
import {
  SCREEN_DELIVERY_KEY,
  mergeScreenDeliveryDefaults,
  type ScreenDeliverySettings,
} from '@/lib/settings/screen-delivery';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';

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

  // Page « Commandes » : visible seulement si l'option « Écran & Livraison »
  // est active. Le réglage est PAR BOUTIQUE (repli organisation). En caisse, on
  // regarde la boutique du poste appairé ; au back-office (pas de boutique
  // courante), on l'affiche dès qu'AU MOINS UNE boutique l'a activée. Si aucune
  // ne l'a, on masque /orders du menu (sidebar + « Toutes les pages »).
  const hiddenPaths = [...(ui.hidden_sidebar_paths ?? [])];
  let screenDeliveryActive: boolean;
  if (backOffice) {
    const [storesRes, sdRows] = await Promise.all([
      query<{ id: string }>(
        `SELECT id FROM stores WHERE organization_id = $1 AND is_active = TRUE`,
        [user.organizationId],
      ),
      query<{ key: string; value: Partial<ScreenDeliverySettings> }>(
        `SELECT key, value FROM settings
          WHERE organization_id = $1 AND key LIKE 'screen_delivery%'`,
        [user.organizationId],
      ),
    ]);
    const orgVal = sdRows.rows.find((r) => r.key === SCREEN_DELIVERY_KEY)?.value ?? null;
    const byStore = new Map(
      sdRows.rows
        .filter((r) => r.key.startsWith(`${SCREEN_DELIVERY_KEY}:`))
        .map((r) => [r.key.slice(SCREEN_DELIVERY_KEY.length + 1), r.value]),
    );
    // Une boutique est « active » selon son réglage propre, sinon le repli org.
    screenDeliveryActive = storesRes.rows.length === 0
      ? mergeScreenDeliveryDefaults(orgVal).enabled
      : storesRes.rows.some((s) =>
          mergeScreenDeliveryDefaults(byStore.get(s.id) ?? orgVal).enabled);
  } else {
    const storeId = await resolveDeviceStoreId(user.organizationId);
    screenDeliveryActive = mergeScreenDeliveryDefaults(
      await loadScopedSettingValue<ScreenDeliverySettings>(
        user.organizationId, SCREEN_DELIVERY_KEY, storeId,
      ),
    ).enabled;
  }
  if (!screenDeliveryActive && !hiddenPaths.includes('/orders')) {
    hiddenPaths.push('/orders');
  }

  return (
    <>
      <NoZoom />
      <SupportBanner />
      {/* Le consentement de dépannage se décide au back-office (owner/manager),
          jamais sur une caisse de vente — important en multi-boutique. */}
      {backOffice && <SupportConsentGate role={user.role} />}
      <AppShell
        user={{ id: user.id, fullName: user.fullName, role: user.role, email: user.email }}
        hiddenPaths={hiddenPaths}
        autoLogoutMode={ui.auto_logout_mode}
        autoLogoutMinutes={ui.auto_logout_minutes}
        headerTabs={ui.header_tabs ?? []}
        subscription={subscription}
        permissions={Array.from(effectivePerms)}
        backOffice={backOffice}
      >
        {children}
      </AppShell>
    </>
  );
}

