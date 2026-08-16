/**
 * Questions fréquentes.
 *
 * Chaque réponse décrit le produit tel qu'il est. Quand une réponse dépend de
 * la boutique (matériel existant, cas particulier), elle le dit et renvoie
 * vers un échange plutôt que d'affirmer.
 */

export interface FaqItem {
  /** Identifiant stable, utilisé pour reprendre une question sur une page. */
  key?: string;
  q: string;
  a: string;
  /** Lien complémentaire affiché sous la réponse. */
  link?: { href: string; label: string };
}

export const FAQ: FaqItem[] = [
  {
    key: 'essai',
    q: 'Puis-je essayer HelloPos ?',
    a: 'Oui. La création de votre espace prend quelques minutes et l’essai dure 14 jours : vous configurez votre société, votre boutique, votre caisse et vos taux de TVA, puis vous vendez pour de vrai.',
    link: { href: '/setup', label: 'Créer mon espace' },
  },
  {
    key: 'engagement',
    q: 'Y a-t-il un engagement ?',
    a: 'Non. L’abonnement est mensuel et se résilie depuis votre espace, sans durée minimale.',
    link: { href: '/tarifs', label: 'Voir les formules' },
  },
  {
    key: 'materiel',
    q: 'Quel matériel faut-il ?',
    a: 'Une tablette récente suffit pour commencer. Pour imprimer les tickets et ouvrir un tiroir-caisse, HelloPos pilote les imprimantes Star compatibles CloudPRNT (TSP143, mC-Print3) raccordées en Ethernet.',
    link: { href: '/materiel', label: 'Voir le matériel' },
  },
  {
    key: 'materiel-existant',
    q: 'Puis-je conserver mon matériel actuel ?',
    a: 'Souvent, oui : une douchette USB ou Bluetooth fonctionne telle quelle, et une tablette récente convient. Pour l’imprimante et le tiroir, cela dépend du modèle. Envoyez-nous vos références, nous vous répondons précisément.',
    link: { href: '/contact', label: 'Vérifier mon matériel' },
  },
  {
    key: 'tablette',
    q: 'HelloPos fonctionne-t-il sur tablette ?',
    a: 'Oui. L’écran de caisse est conçu pour le tactile et s’utilise dans le navigateur d’une tablette ; il peut être ajouté à l’écran d’accueil comme une application. Le back-office s’ouvre depuis n’importe quel navigateur.',
  },
  {
    key: 'multi-boutiques',
    q: 'Puis-je gérer plusieurs boutiques ?',
    a: 'Oui, avec l’offre Réseau : boutiques et caisses illimitées, catalogue partagé, transferts de stock entre boutiques et activité consolidée. Les offres Smart et Pro couvrent une boutique.',
    link: { href: '/tarifs', label: 'Comparer les formules' },
  },
  {
    key: 'stocks',
    q: 'Puis-je gérer mes stocks ?',
    a: 'Oui. Les ventes, les réceptions, les pertes et les transferts alimentent les mouvements de stock. Les inventaires se comptent par boutique, avec les écarts affichés avant validation, et chaque article porte son fournisseur, son prix d’achat et sa marge.',
    link: { href: '/fonctionnalites#stocks', label: 'La gestion des stocks' },
  },
  {
    key: 'commandes',
    q: 'Puis-je gérer des commandes ?',
    a: 'Oui. Une commande se prend en caisse avec sa date de retrait ou de livraison et, si besoin, un acompte ; le solde est encaissé au retrait. Les commandes du jour s’affichent dans la liste de préparation, et sur l’écran atelier avec les offres Pro et Réseau.',
    link: { href: '/fonctionnalites#commandes', label: 'Les commandes' },
  },
  {
    key: 'fidelite',
    q: 'Comment fonctionne la fidélité ?',
    a: 'Les points se cumulent automatiquement sur la fiche du client associé à la vente, selon les règles que vous définissez. La carte de fidélité peut être ajoutée à Apple Wallet. Le périmètre du programme est paramétrable avec les offres Pro et Réseau.',
    link: { href: '/fonctionnalites#clients', label: 'Clients et fidélité' },
  },
  {
    key: 'comptable',
    q: 'Puis-je transmettre mes données à mon comptable ?',
    a: 'Oui. Les exports comptables (ventes par compte, écritures) se téléchargent depuis le back-office, et les rapports de ventes et de TVA sont consultables sur la période de votre choix.',
    link: { href: '/conformite', label: 'La conformité en détail' },
  },
  {
    key: 'installation',
    q: 'Comment se déroule l’installation ?',
    a: 'Nous commençons par regarder comment votre boutique fonctionne, puis nous configurons HelloPos avec vous : société, boutique, caisse, TVA, catalogue, utilisateurs et matériel. Vous démarrez accompagné, et nous restons joignables ensuite.',
    link: { href: '/contact', label: 'Parler de votre installation' },
  },
  {
    key: 'support',
    q: 'Comment contacter le support ?',
    a: 'Par email, depuis la page Contact. Décrivez votre situation et, si possible, la boutique concernée : nous revenons vers vous avec une réponse, pas avec un numéro de ticket.',
    link: { href: '/contact', label: 'Nous écrire' },
  },
];
