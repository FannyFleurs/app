/**
 * Limites fonctionnelles par offre. Le `plan` provient de la table
 * subscriptions ('starter' = Essentiel, 'pro' = Croissance,
 * 'enterprise' = Réseau ; 'trial' = essai sans limite tant que Stripe
 * n'impose pas d'offre).
 */
export interface PlanLimits {
  /** Nombre de boutiques autorisées. */
  maxStores: number;
  /** Nombre de caisses par boutique. */
  maxRegistersPerStore: number;
  /** Libellé de l'offre pour les messages. */
  label: string;
}

export function planLimits(plan: string | null | undefined): PlanLimits {
  switch (plan) {
    case 'starter':
      return { maxStores: 1, maxRegistersPerStore: 1, label: 'Essentiel' };
    case 'pro':
      return { maxStores: 1, maxRegistersPerStore: Infinity, label: 'Croissance' };
    case 'enterprise':
      return { maxStores: Infinity, maxRegistersPerStore: Infinity, label: 'Réseau' };
    default:
      // trial / inconnu : pas de blocage (l'essai laisse tout tester).
      return { maxStores: Infinity, maxRegistersPerStore: Infinity, label: 'Essai' };
  }
}

/** Plan effectif d'une org (subscription.plan, fallback organizations.plan). */
export function effectivePlan(subPlan: string | null, orgPlan: string | null): string {
  return subPlan ?? orgPlan ?? 'trial';
}
