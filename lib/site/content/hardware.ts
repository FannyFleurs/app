/**
 * Matériel.
 *
 * Le contenu de cette page engage : on ne cite ici que des matériels dont la
 * prise en charge est visible dans le produit.
 *   - Imprimante ticket et ouverture du tiroir : imprimantes Star CloudPRNT
 *     (TSP143, mC-Print3) en Ethernet — `app/(app)/settings/receipt-printer`.
 *   - Imprimante étiquettes : Star mC-Label3 en Ethernet —
 *     `app/(app)/settings/label-printer`.
 *   - PDA : stations d'impression d'étiquettes rattachées à une boutique —
 *     `app/(app)/settings/label-stations` et le sous-domaine pda.
 *   - Lecture de code-barres : caméra de la tablette
 *     (`app/(app)/caisse/BarcodeScannerModal.tsx`) ou douchette qui saisit
 *     dans le champ « Rechercher / scanner » de l'écran de caisse.
 *   - Écran atelier : tablette murale sur le sous-domaine ecran.
 *
 * Tout le reste (affichage client dédié, connexion directe à un terminal de
 * paiement) n'existe pas à ce jour et est présenté comme tel.
 */

export type HardwareStatus = 'supported' | 'optional' | 'to-check';

export interface HardwareItem {
  name: string;
  role: string;
  detail: string;
  status: HardwareStatus;
  icon: string;
}

export interface HardwareGroup {
  title: string;
  intro: string;
  items: HardwareItem[];
}

export const HARDWARE: HardwareGroup[] = [
  {
    title: 'L’essentiel',
    intro: 'De quoi ouvrir demain matin.',
    items: [
      {
        name: 'Tablette',
        role: 'Votre caisse',
        detail:
          'HelloPos s’utilise dans le navigateur d’une tablette récente, iPad ou Android, et peut être ajouté à l’écran d’accueil comme une application. Un ordinateur convient aussi pour le back-office.',
        status: 'supported',
        icon: 'tablet',
      },
      {
        name: 'Imprimante ticket',
        role: 'Le ticket et le rapport Z',
        detail:
          'Imprimantes Star compatibles CloudPRNT (TSP143, mC-Print3) raccordées en Ethernet. Le ticket, le ticket cadeau et le rapport Z s’impriment sans boîte de dialogue.',
        status: 'supported',
        icon: 'printer',
      },
      {
        name: 'Tiroir-caisse',
        role: 'Les espèces',
        detail:
          'Le tiroir se branche sur l’imprimante ticket. HelloPos commande son ouverture depuis l’écran de caisse, selon les permissions accordées à chaque utilisateur.',
        status: 'supported',
        icon: 'drawer',
      },
      {
        name: 'Lecture de code-barres',
        role: 'Le scan',
        detail:
          'La caméra de la tablette lit un code-barres depuis l’écran de caisse. Une douchette USB ou Bluetooth fonctionne également : elle saisit dans le champ « Rechercher / scanner ».',
        status: 'supported',
        icon: 'scan',
      },
    ],
  },
  {
    title: 'Pour aller plus loin',
    intro: 'Quand la boutique grandit, ou quand le rayon s’étend.',
    items: [
      {
        name: 'Imprimante étiquettes',
        role: 'Le rayon',
        detail:
          'Star mC-Label3 en Ethernet : les étiquettes code-barres partent directement du logiciel, sans passer par un traitement de texte.',
        status: 'optional',
        icon: 'label',
      },
      {
        name: 'PDA',
        role: 'L’étiquetage en rayon',
        detail:
          'Une station d’impression portable, déclarée dans les réglages et rattachée à une boutique, pour étiqueter là où sont les produits.',
        status: 'optional',
        icon: 'pda',
      },
      {
        name: 'Écran atelier',
        role: 'La préparation',
        detail:
          'Une tablette murale affiche les commandes à préparer du jour, mise à jour en continu. Inclus dans les offres Pro et Réseau.',
        status: 'optional',
        icon: 'screen',
      },
      {
        name: 'Écran de suivi',
        role: 'Le chiffre du jour',
        detail:
          'Un écran dédié affiche le chiffre d’affaires en direct, utile en réserve ou au bureau.',
        status: 'optional',
        icon: 'chart',
      },
    ],
  },
  {
    title: 'À vérifier ensemble',
    intro: 'Deux points sur lesquels nous préférons être clairs.',
    items: [
      {
        name: 'Affichage client',
        role: 'Le second écran face au client',
        detail:
          'HelloPos ne propose pas, à ce jour, de module d’affichage client dédié. Si votre comptoir en est équipé, parlons-en avant toute décision.',
        status: 'to-check',
        icon: 'screen',
      },
      {
        name: 'TPE',
        role: 'Le paiement par carte',
        detail:
          'Aucune connexion directe à un terminal de paiement n’est proposée à ce jour : le règlement est encaissé sur le terminal de votre banque, puis enregistré en caisse comme règlement carte.',
        status: 'to-check',
        icon: 'card',
      },
    ],
  },
];
