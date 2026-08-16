/**
 * Questionnaire de contact du site.
 *
 * Quatre étapes, treize questions, des coordonnées. Les questions vivent ici
 * pour pouvoir être modifiées sans toucher au composant : ajouter une option,
 * renommer une étape ou rendre une question facultative ne demande qu'une
 * ligne.
 *
 * Les réponses sont mises en forme en texte lisible et envoyées dans le
 * message de la demande (voir `buildMessage`) : l'équipe les lit dans la
 * console d'administration comme n'importe quelle autre demande.
 */

export type QuestionKind = 'single' | 'multi' | 'text';

export interface Question {
  /** Identifiant stable, utilisé comme clé de réponse. */
  id: string;
  /** Intitulé affiché. */
  label: string;
  kind: QuestionKind;
  options?: string[];
  /** Précision sous l'intitulé. */
  hint?: string;
  /** Réponse attendue pour passer à l'étape suivante. */
  required?: boolean;
  /** Affichée seulement si la question `id` vaut l'une de ces valeurs. */
  showIf?: { id: string; equals: string[] };
  /** Intitulé repris dans le récapitulatif envoyé. */
  summaryLabel: string;
  placeholder?: string;
}

export interface Step {
  /** Titre de l'étape, affiché en tête de formulaire. */
  title: string;
  /** Libellé court, affiché dans la barre de progression. */
  short: string;
  questions: Question[];
}

export const CONTACT_STEPS: Step[] = [
  {
    title: 'Parlez-nous de votre projet',
    short: 'Votre projet',
    questions: [
      {
        id: 'motif',
        label: 'Vous nous contactez pour',
        kind: 'single',
        required: true,
        summaryLabel: 'Motif',
        options: [
          'Découvrir HelloPos',
          'Demander une démonstration',
          'Changer de logiciel de caisse',
          'Équiper une nouvelle boutique',
          'Équiper plusieurs boutiques',
          'Vérifier mon matériel',
          'Autre',
        ],
      },
      {
        id: 'echeance',
        label: 'Quand souhaitez-vous mettre en place votre solution ?',
        kind: 'single',
        summaryLabel: 'Échéance',
        options: [
          'Dès que possible',
          'Dans moins d’un mois',
          'Dans 1 à 3 mois',
          'Dans 3 à 6 mois',
          'Plus tard',
          'Je me renseigne simplement',
        ],
      },
    ],
  },
  {
    title: 'Quelques informations sur votre activité',
    short: 'Votre commerce',
    questions: [
      {
        id: 'metier',
        label: 'Type de commerce',
        kind: 'single',
        summaryLabel: 'Type de commerce',
        options: [
          'Fleuriste',
          'Caviste',
          'Jardinerie',
          'Concept store',
          'Épicerie',
          'Prêt-à-porter',
          'Autre',
        ],
      },
      {
        id: 'boutiques',
        label: 'Nombre de boutiques',
        kind: 'single',
        summaryLabel: 'Boutiques',
        options: ['1', '2', '3 à 5', '6 à 10', 'Plus de 10'],
      },
      {
        id: 'caisses',
        label: 'Nombre total de caisses à équiper',
        kind: 'single',
        summaryLabel: 'Caisses à équiper',
        options: ['1', '2', '3 à 5', '6 à 10', 'Plus de 10'],
      },
      {
        id: 'utilisateurs',
        label: 'Nombre de personnes qui utiliseront HelloPos',
        kind: 'single',
        summaryLabel: 'Utilisateurs',
        options: ['1', '2 à 5', '6 à 10', '11 à 20', 'Plus de 20'],
      },
      {
        id: 'ca',
        label: 'Chiffre d’affaires annuel approximatif',
        hint: 'Facultatif. Cela nous aide à vous orienter vers la bonne formule.',
        kind: 'single',
        summaryLabel: 'Chiffre d’affaires',
        options: [
          'Moins de 250 000 €',
          '250 000 à 500 000 €',
          '500 000 € à 1 M€',
          '1 à 3 M€',
          'Plus de 3 M€',
          'Je préfère ne pas répondre',
        ],
      },
    ],
  },
  {
    title: 'Comment travaillez-vous aujourd’hui ?',
    short: 'Votre organisation',
    questions: [
      {
        id: 'logiciel_actuel',
        label: 'Utilisez-vous déjà un logiciel de caisse ?',
        kind: 'single',
        summaryLabel: 'Logiciel de caisse actuel',
        options: ['Oui', 'Non'],
      },
      {
        id: 'logiciel_nom',
        label: 'Quel logiciel utilisez-vous actuellement ?',
        kind: 'text',
        placeholder: 'Nom du logiciel',
        summaryLabel: 'Logiciel utilisé',
        showIf: { id: 'logiciel_actuel', equals: ['Oui'] },
      },
      {
        id: 'raisons',
        label: 'Pourquoi envisagez-vous de changer ?',
        hint: 'Plusieurs réponses possibles.',
        kind: 'multi',
        summaryLabel: 'Raisons du changement',
        showIf: { id: 'logiciel_actuel', equals: ['Oui'] },
        options: [
          'Logiciel trop limité',
          'Trop cher',
          'Trop complexe',
          'Gestion des stocks insuffisante',
          'Gestion multi-boutiques insuffisante',
          'Manque de fonctionnalités',
          'Support insuffisant',
          'Matériel vieillissant',
          'Je souhaite tout centraliser',
          'Autre',
        ],
      },
      {
        id: 'materiel',
        label: 'Disposez-vous déjà de matériel ?',
        kind: 'single',
        summaryLabel: 'Matériel existant',
        options: [
          'Oui, je souhaite le conserver',
          'Oui, mais je souhaite le remplacer',
          'Partiellement',
          'Non',
        ],
      },
    ],
  },
  {
    title: 'Que souhaitez-vous gérer avec HelloPos ?',
    short: 'Vos besoins',
    questions: [
      {
        id: 'fonctionnalites',
        label: 'Fonctionnalités recherchées',
        hint: 'Plusieurs réponses possibles.',
        kind: 'multi',
        summaryLabel: 'Fonctionnalités recherchées',
        options: [
          'Encaissement',
          'Stocks',
          'Inventaires',
          'Étiquettes',
          'PDA / réception marchandises',
          'Commandes à préparer',
          'Retraits',
          'Livraisons',
          'Clients',
          'Fidélité',
          'Wallet',
          'Cartes cadeaux',
          'Avoirs',
          'Facturation',
          'Comptes professionnels',
          'Exports comptables',
          'Pilotage à distance',
          'Multi-boutiques',
          'Transferts entre boutiques',
          'Gestion des utilisateurs',
        ],
      },
      {
        id: 'difficulte',
        label: 'Quelle est votre principale difficulté aujourd’hui ?',
        kind: 'single',
        summaryLabel: 'Principale difficulté',
        options: [
          'J’utilise trop d’outils différents',
          'Ma caisse actuelle est trop limitée',
          'Je souhaite mieux gérer mes stocks',
          'Je souhaite mieux gérer mes commandes',
          'Je souhaite gérer plusieurs boutiques',
          'Je souhaite mieux fidéliser mes clients',
          'Mon logiciel actuel est trop cher',
          'Je crée mon commerce',
          'Autre',
        ],
      },
    ],
  },
];

/** Réponses saisies : une valeur par question (liste pour les choix multiples). */
export type Answers = Record<string, string | string[] | undefined>;

/** Coordonnées demandées à la fin du parcours. */
export interface ContactDetails {
  firstName: string;
  lastName: string;
  shop: string;
  email: string;
  phone: string;
  city: string;
  message: string;
}

/** Une question doit-elle être affichée, compte tenu des réponses données ? */
export function isVisible(question: Question, answers: Answers): boolean {
  if (!question.showIf) return true;
  const value = answers[question.showIf.id];
  return typeof value === 'string' && question.showIf.equals.includes(value);
}

/** Questions d'une étape effectivement affichées. */
export function visibleQuestions(step: Step, answers: Answers): Question[] {
  return step.questions.filter((q) => isVisible(q, answers));
}

/**
 * Récapitulatif envoyé à l'équipe : les réponses en texte lisible, dans
 * l'ordre du formulaire, sans les questions restées sans réponse.
 */
export function buildMessage(answers: Answers, details: ContactDetails): string {
  const lines: string[] = [];

  for (const step of CONTACT_STEPS) {
    const block: string[] = [];
    for (const q of visibleQuestions(step, answers)) {
      const value = answers[q.id];
      const text = Array.isArray(value) ? value.join(', ') : (value ?? '').trim();
      if (text) block.push(`${q.summaryLabel} : ${text}`);
    }
    if (block.length) {
      lines.push(`— ${step.short}`, ...block, '');
    }
  }

  const contact: string[] = [];
  if (details.city.trim()) contact.push(`Code postal / ville : ${details.city.trim()}`);
  if (contact.length) lines.push('— Coordonnées', ...contact, '');

  if (details.message.trim()) lines.push('— Message', details.message.trim());

  // Le champ message de l'API est limité à 4 000 caractères.
  return lines.join('\n').trim().slice(0, 3900);
}
