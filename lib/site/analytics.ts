/**
 * Mesure des conversions du site vitrine.
 *
 * Aucun outil n'est imposé : `track()` pousse l'événement vers les solutions
 * présentes dans la page (dataLayer GTM, gtag, Plausible, Matomo). Si aucune
 * n'est chargée, l'appel ne fait rien — le site fonctionne à l'identique.
 *
 * Les éléments cliquables portent l'attribut `data-track="<événement>"`
 * (et, au besoin, `data-track-props='{"plan":"pro"}'`) ; un unique écouteur
 * délégué dans <AnalyticsBridge /> déclenche l'envoi. Aucun gestionnaire
 * par bouton, donc aucun JavaScript supplémentaire par composant.
 */

/** Événements suivis. Cette liste fait foi côté plan de taggage. */
export const EVENTS = {
  /** CTA principal : « Essayer HelloPos » / « Commencer gratuitement ». */
  trialStart: 'essai_hellopos',
  /** CTA secondaire : « Réserver une démo » (formulaire de contact). */
  demoBook: 'reserver_demo',
  /** Lecture de la démonstration vidéo. */
  demoWatch: 'voir_demo',
  /** Consultation de la page Tarifs. */
  pricingView: 'voir_tarifs',
  /** Choix d'une formule depuis la page Tarifs. */
  planSelect: 'choisir_formule',
  /** Première saisie dans un formulaire. */
  formStart: 'formulaire_commence',
  /** Formulaire envoyé avec succès. */
  formSubmit: 'formulaire_envoye',
  /** Consultation d'une page métier. */
  tradeView: 'page_metier',
  /** Consultation d'un cas client. */
  caseView: 'cas_client',
  /** Consultation de la page Matériel. */
  hardwareView: 'materiel',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

type Props = Record<string, string | number | boolean>;

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (command: string, event: string, params?: Props) => void;
  plausible?: (event: string, options?: { props: Props }) => void;
  _paq?: unknown[];
}

/** Envoie un événement à toutes les solutions analytics détectées. */
export function track(event: string, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  const w = window as AnalyticsWindow;
  try {
    w.dataLayer?.push({ event, ...props });
    w.gtag?.('event', event, props);
    w.plausible?.(event, { props });
    w._paq?.push(['trackEvent', 'site', event, JSON.stringify(props)]);
  } catch {
    /* la mesure ne doit jamais casser la navigation */
  }
}
