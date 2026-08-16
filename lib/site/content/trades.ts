/**
 * Métiers.
 *
 * Chaque métier a deux expressions sur le site :
 *   - la page « solution » (/solutions/<slug>) : ce que HelloPos change dans
 *     ce commerce, avec les fonctions réellement utilisées au quotidien ;
 *   - la page SEO (/logiciel-caisse-<métier>) : un contenu propre, écrit pour
 *     ce commerce, et non une page dupliquée.
 *
 * Toutes les fonctions citées existent dans le produit. Les usages décrits
 * sont des usages, pas des promesses de fonctionnalités supplémentaires.
 */

import type { TradeSlug } from '../routes';
import type { IconName } from './features';

export interface TradeHighlight {
  title: string;
  text: string;
  icon: IconName;
}

export interface SeoBlock {
  /** Titre H1 de la page SEO. */
  h1: string;
  title: string;
  description: string;
  intro: string[];
  sections: { h2: string; body: string[]; bullets?: string[] }[];
  faq: { q: string; a: string }[];
}

export interface Trade {
  slug: TradeSlug;
  /** Pluriel, tel qu'affiché dans le sélecteur (« Fleuristes »). */
  label: string;
  /** Article + singulier pour les phrases (« un fleuriste »). */
  singular: string;
  /** Phrase d'accroche de l'onglet. */
  claim: string;
  lede: string;
  /** Ce que HelloPos change chez eux. 4 à 6 entrées. */
  highlights: TradeHighlight[];
  /** Fonctions mises en avant dans le sélecteur de l'accueil. */
  chips: string[];
  /** Capture produit la plus parlante pour ce métier. */
  screen: { src: string; alt: string; crop?: 'top' | 'right' | 'left' };
  /** Emplacement photo (voir lib/site/media.ts). */
  photoSlot: string;
  seo: SeoBlock;
}

export const TRADES: Trade[] = [
  {
    slug: 'fleuristes',
    label: 'Fleuristes',
    singular: 'fleuriste',
    claim: 'HelloPos pour les fleuristes.',
    lede:
      'Des bouquets à prix libre, des commandes datées, des livraisons, un atelier qui tourne : ' +
      'la caisse d’un fleuriste ne ressemble à aucune autre.',
    chips: ['Commandes à préparer', 'Livraisons', 'Stocks', 'Étiquetage', 'Clients professionnels', 'Fidélité'],
    screen: {
      src: '/site/screens/commandes.png',
      alt: 'Écran Commandes de HelloPos : compteurs du jour, à venir, en préparation',
      crop: 'top',
    },
    photoSlot: 'trade-fleuristes',
    highlights: [
      {
        title: 'Le bouquet se compose, le prix se saisit',
        text: 'Les articles à prix libre existent dans le catalogue : la composition est encaissée au montant décidé au comptoir, avec la bonne TVA.',
        icon: 'cart',
      },
      {
        title: 'Une commande pour samedi',
        text: 'Date de retrait ou de livraison, acompte encaissé, solde au retrait. La commande part directement dans la liste du jour concerné.',
        icon: 'orders',
      },
      {
        title: 'L’atelier voit ce qu’il y a à faire',
        text: 'L’écran mural affiche les préparations du jour, mises à jour à chaque prise de commande.',
        icon: 'workshop',
      },
      {
        title: 'Les livraisons ne se perdent plus',
        text: 'Adresse, créneau et frais de transport sont attachés à la commande, pas à un post-it.',
        icon: 'truck',
      },
      {
        title: 'Les comptes pros suivent',
        text: 'Hôtels, restaurants, entreprises : vente en compte, facture au bon format, conditions de règlement.',
        icon: 'ledger',
      },
      {
        title: 'Deux taux de TVA, sans y penser',
        text: 'Le taux réduit des fleurs coupées et le taux normal des contenants cohabitent article par article.',
        icon: 'report',
      },
    ],
    seo: {
      h1: 'Logiciel de caisse pour fleuriste',
      title: 'Logiciel de caisse pour fleuriste — HelloPos',
      description:
        'HelloPos est un logiciel de caisse et de gestion pour fleuristes : bouquets à prix libre, commandes datées, livraisons, atelier, stocks et fidélité. Dès 29 € HT/mois.',
      intro: [
        'Un fleuriste n’encaisse pas seulement : il compose, il note une commande pour dimanche, il prépare une livraison pour un anniversaire, il facture le restaurant du coin en fin de mois. Une caisse qui ne sait faire que le ticket laisse tout le reste sur un carnet.',
        'HelloPos réunit l’encaissement, les commandes, les livraisons, le stock, les clients et le pilotage dans une seule application, utilisable sur tablette au comptoir et depuis un navigateur au bureau.',
      ],
      sections: [
        {
          h2: 'Encaisser une composition dont le prix se décide au comptoir',
          body: [
            'Les articles peuvent être déclarés à prix libre : le vendeur saisit le montant convenu, la TVA de l’article s’applique, la vente part dans le ticket comme n’importe quelle autre ligne.',
            'La recherche et la douchette partagent le même champ : un cache-pot étiqueté se scanne, une composition se cherche au nom.',
          ],
          bullets: [
            'Articles à prix libre pour les bouquets et compositions',
            'Remise, commentaire de ligne, panier mis en attente',
            'Plusieurs règlements sur une même vente',
            'Ticket imprimé, envoyé par email, ou ticket cadeau sans prix',
          ],
        },
        {
          h2: 'Les commandes datées, du comptoir à l’atelier',
          body: [
            'Une commande se prend en caisse, avec sa date de retrait ou de livraison et, si besoin, un acompte. Elle rejoint la liste des commandes à préparer et s’affiche sur l’écran de l’atelier.',
            'Le jour venu, le solde est encaissé au retrait et la commande est clôturée. Rien ne dépend d’un carnet qu’on oublie d’ouvrir un jour de rush.',
          ],
          bullets: [
            'Date de retrait ou de livraison sur la commande',
            'Acompte à la prise de commande, solde au retrait',
            'Adresse de livraison et frais de transport',
            'Écran atelier affiché au mur (offres Pro et Réseau)',
          ],
        },
        {
          h2: 'Le stock d’un commerce où tout ne se compte pas pareil',
          body: [
            'Les contenants, les plantes et les accessoires se suivent à l’unité, avec leur prix d’achat et leur marge. Les entrées de marchandise, les pertes et les transferts laissent une trace, et l’inventaire se compte boutique par boutique.',
            'Les étiquettes code-barres s’impriment au comptoir ou depuis un terminal portable, ce qui rend le scan possible sur tout ce qui n’est pas une fleur coupée.',
          ],
        },
        {
          h2: 'Les clients réguliers et les comptes professionnels',
          body: [
            'La fiche client rassemble l’historique d’achats, les avoirs et les points de fidélité. La carte de fidélité peut être ajoutée à Apple Wallet, ce qui évite un carton de plus dans le porte-monnaie.',
            'Pour les hôtels, les restaurants et les entreprises, la vente peut être portée en compte puis facturée, avec les conditions de règlement et les coordonnées bancaires de la boutique.',
          ],
        },
      ],
      faq: [
        {
          q: 'HelloPos gère-t-il les bouquets dont le prix change à chaque vente ?',
          a: 'Oui. Un article peut être déclaré à prix libre : le montant est saisi au moment de la vente, avec la TVA de l’article.',
        },
        {
          q: 'Peut-on prendre une commande avec un acompte ?',
          a: 'Oui. La commande porte une date de retrait ou de livraison et un acompte facultatif ; le solde est encaissé au retrait.',
        },
        {
          q: 'Les livraisons sont-elles suivies ?',
          a: 'L’adresse de livraison et les frais de transport sont attachés à la commande. Les réglages « Écran & Livraison » sont inclus dans les offres Pro et Réseau.',
        },
      ],
    },
  },
  {
    slug: 'cavistes',
    label: 'Cavistes',
    singular: 'caviste',
    claim: 'HelloPos pour les cavistes.',
    lede:
      'Des centaines de références, des millésimes qui changent, des clients qui reviennent pour la même bouteille : ' +
      'la caisse doit connaître le catalogue mieux que personne.',
    chips: ['Catalogue et codes-barres', 'Stocks', 'Marges', 'Clients professionnels', 'Cartes cadeaux', 'Rapports'],
    screen: { src: '/site/screens/stock.png', alt: 'Gestion des stocks et des références dans HelloPos' },
    photoSlot: 'trade-cavistes',
    highlights: [
      {
        title: 'Le catalogue au bout de la douchette',
        text: 'Chaque référence porte son code-barres : la bouteille se scanne dans le même champ que la recherche, sans changer d’écran.',
        icon: 'tag',
      },
      {
        title: 'La marge, référence par référence',
        text: 'Prix d’achat, prix de vente et marge sont portés par l’article. Les rapports montrent ce qui fait vivre la boutique.',
        icon: 'chart',
      },
      {
        title: 'Le stock à la bouteille',
        text: 'Chaque vente décrémente la référence. Les réceptions et les inventaires se font sans quitter l’application.',
        icon: 'box',
      },
      {
        title: 'Les cartes cadeaux, sans ardoise',
        text: 'Émission, solde suivi, utilisation en caisse : le montant reste dans le système, pas sur un carnet.',
        icon: 'gift',
      },
      {
        title: 'Les comptes restaurants',
        text: 'Vente en compte, facture au bon format, conditions de règlement : le circuit professionnel est prévu.',
        icon: 'ledger',
      },
    ],
    seo: {
      h1: 'Logiciel de caisse pour caviste',
      title: 'Logiciel de caisse pour caviste — HelloPos',
      description:
        'HelloPos est un logiciel de caisse et de gestion pour cavistes : catalogue et codes-barres, stock à la bouteille, marges, comptes professionnels, cartes cadeaux. Dès 29 € HT/mois.',
      intro: [
        'Une cave, c’est un catalogue vivant : des références qui tournent, des millésimes qui remplacent les précédents, des prix d’achat qui bougent. La caisse d’un caviste doit d’abord être un bon catalogue.',
        'HelloPos gère le catalogue, le stock, l’encaissement, les clients professionnels et le pilotage au même endroit, du comptoir au back-office.',
      ],
      sections: [
        {
          h2: 'Un catalogue précis, scanné plutôt que cherché',
          body: [
            'Chaque référence peut porter son code-barres et son étiquette. Au comptoir, la douchette écrit dans le champ de recherche : l’article rejoint le panier sans manipulation.',
            'Les familles d’articles organisent l’écran de vente pour ce qui ne se scanne pas — les ventes au verre, les services, les consignes.',
          ],
          bullets: [
            'Codes-barres et étiquettes imprimées depuis le logiciel',
            'Familles d’articles pour l’écran de vente',
            'Prix d’achat, prix de vente et marge par référence',
            'Fournisseurs rattachés aux articles',
          ],
        },
        {
          h2: 'Le stock suivi bouteille par bouteille',
          body: [
            'Les ventes, les réceptions, les pertes et les transferts alimentent les mouvements de stock. L’inventaire se compte par boutique, avec les écarts affichés avant validation.',
            'Pour une cave qui ouvre un deuxième point de vente, les transferts de stock entre boutiques sont prévus dans l’offre Réseau.',
          ],
        },
        {
          h2: 'Les restaurants et les entreprises',
          body: [
            'Les clients professionnels ont leur fiche, leur historique et leur facturation : vente portée en compte, facture numérotée, conditions de règlement et coordonnées bancaires paramétrables.',
            'Les avoirs et les cartes cadeaux suivent le même circuit, avec un solde contrôlé à l’utilisation.',
          ],
        },
        {
          h2: 'Ce que la journée a réellement rapporté',
          body: [
            'Le tableau de bord donne le chiffre d’affaires, le ticket moyen, la marge et la TVA collectée, comparés à la période précédente. La clôture compte la caisse, scelle la journée et imprime le rapport Z.',
          ],
        },
      ],
      faq: [
        {
          q: 'Peut-on scanner les bouteilles à l’encaissement ?',
          a: 'Oui, dès lors que la référence porte un code-barres. La douchette écrit dans le champ « Rechercher / scanner » de l’écran de caisse.',
        },
        {
          q: 'HelloPos suit-il les marges ?',
          a: 'Le prix d’achat et le prix de vente sont portés par l’article ; la marge apparaît dans le tableau de bord et les rapports.',
        },
        {
          q: 'Peut-on facturer un restaurant en fin de mois ?',
          a: 'Oui. La vente peut être portée en compte pour un client professionnel, puis facturée avec les mentions et conditions de règlement configurées.',
        },
      ],
    },
  },
  {
    slug: 'jardineries',
    label: 'Jardineries',
    singular: 'jardinerie',
    claim: 'HelloPos pour les jardineries.',
    lede:
      'De grandes surfaces, des milliers d’étiquettes, des saisons qui font tout basculer en trois semaines : ' +
      'il faut une caisse qui tient le rythme et un back-office qui suit.',
    chips: ['Étiquetage', 'PDA', 'Stocks', 'Plusieurs caisses', 'Commandes clients', 'Rapports'],
    screen: { src: '/site/screens/rapports.png', alt: 'Rapports d’activité dans le back-office HelloPos' },
    photoSlot: 'trade-jardineries',
    highlights: [
      {
        title: 'Les étiquettes se posent où sont les plantes',
        text: 'Les stations d’impression portables (PDA) impriment les étiquettes directement dans les allées, rattachées à leur boutique.',
        icon: 'tag',
      },
      {
        title: 'Plusieurs caisses, un seul catalogue',
        text: 'Les postes partagent le catalogue et les prix de la boutique ; chacun garde son ouverture et sa clôture.',
        icon: 'stores',
      },
      {
        title: 'Les saisons se lisent dans les chiffres',
        text: 'Comparaison avec la période précédente, chiffre d’affaires par jour et par heure : les pics se voient avant d’être subis.',
        icon: 'chart',
      },
      {
        title: 'Les commandes clients ne se perdent pas',
        text: 'Un végétal à commander, un retrait à date : la commande est enregistrée avec sa date et son acompte.',
        icon: 'orders',
      },
      {
        title: 'Le stock d’un rayon qui bouge vite',
        text: 'Réceptions, inventaires par boutique, écarts affichés : le comptage reste faisable même sur un grand assortiment.',
        icon: 'inventory',
      },
    ],
    seo: {
      h1: 'Logiciel de caisse pour jardinerie',
      title: 'Logiciel de caisse pour jardinerie — HelloPos',
      description:
        'HelloPos est un logiciel de caisse et de gestion pour jardineries : étiquetage en rayon depuis un PDA, plusieurs caisses, stocks, commandes clients et rapports. Dès 29 € HT/mois.',
      intro: [
        'Une jardinerie vit à un rythme que peu de commerces connaissent : trois semaines décident d’une saison, l’assortiment change, les étiquettes doivent suivre en rayon et la file d’attente ne pardonne rien.',
        'HelloPos couvre l’encaissement multi-postes, l’étiquetage, le stock, les commandes clients et le pilotage, avec un back-office consultable depuis n’importe quel navigateur.',
      ],
      sections: [
        {
          h2: 'Étiqueter en rayon, pas au bureau',
          body: [
            'Les étiquettes code-barres s’impriment depuis le logiciel. Des stations portables (PDA) peuvent être déclarées et rattachées à une boutique pour imprimer directement là où se trouvent les produits.',
            'Le code-barres imprimé rend ensuite le scan possible en caisse, ce qui accélère les passages en période de forte affluence.',
          ],
          bullets: [
            'Impression d’étiquettes depuis le back-office ou depuis un PDA',
            'Stations d’étiquettes rattachées à une boutique',
            'Recherche et douchette dans le même champ en caisse',
          ],
        },
        {
          h2: 'Plusieurs caisses en même temps',
          body: [
            'L’offre Pro autorise jusqu’à cinq caisses sur une boutique, l’offre Réseau lève la limite et ouvre le multi-boutiques. Les postes partagent le catalogue et les prix.',
            'Chaque poste garde son fond de caisse et sa clôture ; les rapports consolident ensuite la journée.',
          ],
        },
        {
          h2: 'Un stock large, tenu par des inventaires réalistes',
          body: [
            'Les mouvements de stock sont enregistrés à la vente comme à la réception. L’inventaire se compte par boutique, avec les écarts affichés avant validation, ce qui permet de traiter un rayon à la fois.',
            'Les fournisseurs, les prix d’achat et les marges sont portés par l’article.',
          ],
        },
        {
          h2: 'Lire une saison',
          body: [
            'Le tableau de bord compare la période en cours à la précédente et détaille le chiffre d’affaires par jour et par heure. Les rapports ventes, TVA et produits complètent la lecture, et les exports comptables partent au cabinet.',
          ],
        },
      ],
      faq: [
        {
          q: 'Peut-on imprimer les étiquettes directement en rayon ?',
          a: 'Oui, via une station d’impression portable (PDA) déclarée dans les réglages et rattachée à une boutique.',
        },
        {
          q: 'Combien de caisses peut-on ouvrir ?',
          a: 'Une caisse en offre Smart (une caisse supplémentaire est proposée en option), jusqu’à cinq en offre Pro, sans limite en offre Réseau.',
        },
        {
          q: 'HelloPos gère-t-il plusieurs points de vente ?',
          a: 'Oui, avec l’offre Réseau : boutiques illimitées, transferts de stock et activité consolidée.',
        },
      ],
    },
  },
  {
    slug: 'concept-stores',
    label: 'Concept stores',
    singular: 'concept store',
    claim: 'HelloPos pour les concept stores.',
    lede:
      'Déco, papeterie, bijoux, textile, café : un assortiment qui vient de partout, ' +
      'et une caisse qui doit rester lisible pour toute l’équipe.',
    chips: ['Familles d’articles', 'Fournisseurs', 'Cartes cadeaux', 'Fidélité', 'Ticket cadeau', 'Rapports'],
    screen: { src: '/site/screens/caisse.png', alt: 'Écran de caisse HelloPos avec familles d’articles' },
    photoSlot: 'trade-concept-stores',
    highlights: [
      {
        title: 'Un écran de vente qui reste lisible',
        text: 'Les familles d’articles structurent la caisse : une nouvelle personne comprend l’écran en une matinée.',
        icon: 'cart',
      },
      {
        title: 'Des fournisseurs partout, des marges au clair',
        text: 'Chaque article porte son fournisseur, son prix d’achat et sa marge. Les rapports disent ce qui tourne.',
        icon: 'supplier',
      },
      {
        title: 'Le cadeau, correctement traité',
        text: 'Ticket cadeau sans prix, carte cadeau avec solde suivi, avoir en cas de retour : le circuit est complet.',
        icon: 'gift',
      },
      {
        title: 'Des clients qu’on reconnaît',
        text: 'Fiche client, historique, points de fidélité et carte dans Apple Wallet.',
        icon: 'loyalty',
      },
      {
        title: 'Une deuxième adresse, le jour venu',
        text: 'Le multi-boutiques partage le catalogue et consolide l’activité, sans repartir de zéro.',
        icon: 'stores',
      },
    ],
    seo: {
      h1: 'Logiciel de caisse pour concept store',
      title: 'Logiciel de caisse pour concept store — HelloPos',
      description:
        'HelloPos est un logiciel de caisse et de gestion pour concept stores : assortiment multi-familles, fournisseurs et marges, cartes cadeaux, fidélité, multi-boutiques. Dès 29 € HT/mois.',
      intro: [
        'Un concept store additionne des univers : de la déco, de la papeterie, du textile, parfois un coin café. Le catalogue est hétérogène, les fournisseurs sont nombreux, et l’équipe change plus souvent qu’ailleurs.',
        'HelloPos garde l’écran de vente simple tout en tenant un catalogue riche, et rassemble clients, stocks, fidélité et pilotage dans la même application.',
      ],
      sections: [
        {
          h2: 'Un catalogue large, un écran de vente simple',
          body: [
            'Les familles d’articles organisent l’écran de caisse. Ce qui est étiqueté se scanne, le reste se trouve par la recherche ou par une tuile.',
            'Les paniers en attente permettent de gérer deux clients à la fois sans perdre la vente en cours.',
          ],
          bullets: [
            'Familles d’articles et tuiles paramétrables',
            'Codes-barres et étiquettes imprimées depuis le logiciel',
            'Paniers en attente, remises, commentaires de ligne',
          ],
        },
        {
          h2: 'Les cadeaux, une part du métier',
          body: [
            'Le ticket cadeau s’imprime sans les prix. La carte cadeau est émise, son solde est suivi, et elle se règle en caisse comme un autre moyen de paiement. Un retour donne lieu à un avoir rattaché à la fiche client.',
          ],
        },
        {
          h2: 'Savoir ce qui tourne, marque par marque',
          body: [
            'Le fournisseur, le prix d’achat et la marge sont portés par l’article. Les rapports produits et le tableau de bord montrent ce qui se vend, ce qui dort et ce que la boutique gagne réellement.',
          ],
        },
        {
          h2: 'Une équipe qui change, des accès qui restent nets',
          body: [
            'Chaque personne a son compte et son code de caisse. Les permissions par rôle déterminent qui peut remiser, annuler, ouvrir le tiroir ou consulter les chiffres.',
          ],
        },
      ],
      faq: [
        {
          q: 'Peut-on imprimer un ticket sans les prix ?',
          a: 'Oui, le ticket cadeau reprend les articles sans les montants.',
        },
        {
          q: 'Comment sont gérées les cartes cadeaux ?',
          a: 'Elles sont émises depuis le logiciel, leur solde est suivi, et elles constituent un moyen de règlement en caisse.',
        },
        {
          q: 'Peut-on limiter ce que voit l’équipe ?',
          a: 'Oui, via les permissions par rôle : remise, annulation, accès aux chiffres et aux réglages se règlent séparément.',
        },
      ],
    },
  },
  {
    slug: 'epiceries',
    label: 'Épiceries',
    singular: 'épicerie',
    claim: 'HelloPos pour les épiceries.',
    lede:
      'Des passages rapides, des taux de TVA différents dans le même panier, ' +
      'des fournisseurs locaux : tout doit tenir en quelques gestes.',
    chips: ['Encaissement rapide', 'Codes-barres', 'TVA multiples', 'Stocks', 'Fournisseurs', 'Fidélité'],
    screen: { src: '/site/screens/caisse-paiement.png', alt: 'Encaissement rapide dans HelloPos' },
    photoSlot: 'trade-epiceries',
    highlights: [
      {
        title: 'Le passage en caisse tient en quelques secondes',
        text: 'Scan, tuiles pour ce qui n’a pas de code-barres, rendu monnaie affiché : l’écran ne demande rien d’inutile.',
        icon: 'cart',
      },
      {
        title: 'Plusieurs taux de TVA dans le même panier',
        text: 'Le taux est porté par l’article. Les rapports ventilent ensuite la TVA collectée par taux.',
        icon: 'report',
      },
      {
        title: 'Les producteurs et les fournisseurs',
        text: 'Références, prix d’achat, marge : ce que rapporte réellement chaque produit reste visible.',
        icon: 'supplier',
      },
      {
        title: 'Le prix libre pour la vente à la découpe',
        text: 'Un article peut être encaissé au montant saisi au comptoir, avec sa TVA.',
        icon: 'tag',
      },
      {
        title: 'Des habitués reconnus',
        text: 'Fiche client, historique, points de fidélité et carte dans Apple Wallet.',
        icon: 'loyalty',
      },
    ],
    seo: {
      h1: 'Logiciel de caisse pour épicerie',
      title: 'Logiciel de caisse pour épicerie — HelloPos',
      description:
        'HelloPos est un logiciel de caisse et de gestion pour épiceries : encaissement rapide, codes-barres, plusieurs taux de TVA, stocks, fournisseurs et fidélité. Dès 29 € HT/mois.',
      intro: [
        'Dans une épicerie, la caisse est jugée sur une seule chose : la vitesse au comptoir, un samedi à midi. Mais derrière, il faut aussi savoir ce qui reste en rayon, ce que rapporte un produit et combien de TVA a été collectée, à quel taux.',
        'HelloPos tient les deux : un écran de vente direct, et une gestion complète dans le même abonnement.',
      ],
      sections: [
        {
          h2: 'Encaisser vite, sans écran de trop',
          body: [
            'La douchette et la recherche partagent le même champ. Ce qui n’a pas de code-barres se trouve en une tuile. Le panier reste visible, les remises et les commentaires sont à portée, le rendu monnaie s’affiche à l’encaissement.',
            'Un client s’absente pour aller chercher un article ? Le panier passe en attente et se reprend en un geste.',
          ],
          bullets: [
            'Scan et recherche dans le même champ',
            'Articles à prix libre pour la vente à la découpe',
            'Plusieurs règlements sur une même vente',
            'Paniers en attente',
          ],
        },
        {
          h2: 'Plusieurs taux de TVA, correctement ventilés',
          body: [
            'Le taux de TVA est porté par l’article, et un taux par défaut est défini par boutique. Les rapports et les exports comptables ventilent ensuite les ventes par taux.',
          ],
        },
        {
          h2: 'Le stock et les fournisseurs locaux',
          body: [
            'Les réceptions, les ventes et les pertes alimentent les mouvements de stock. Chaque article porte son fournisseur, son prix d’achat et sa marge, ce qui rend les arbitrages de rayon plus simples.',
            'L’inventaire se compte par boutique, avec les écarts affichés avant validation.',
          ],
        },
        {
          h2: 'Clôturer sans y passer la soirée',
          body: [
            'La clôture compte les espèces, affiche l’écart, scelle la journée et imprime le rapport Z. Les exports comptables sont prêts pour le cabinet.',
          ],
        },
      ],
      faq: [
        {
          q: 'HelloPos gère-t-il plusieurs taux de TVA ?',
          a: 'Oui. Le taux est porté par l’article, avec un taux par défaut par boutique, et les rapports ventilent la TVA collectée par taux.',
        },
        {
          q: 'Peut-on vendre un article dont le prix se saisit au comptoir ?',
          a: 'Oui, en déclarant l’article à prix libre : le montant est saisi à la vente.',
        },
        {
          q: 'Faut-il une douchette ?',
          a: 'Ce n’est pas obligatoire : la caméra de la tablette peut lire un code-barres, et les articles restent accessibles par la recherche et les tuiles.',
        },
      ],
    },
  },
];

export function tradeBySlug(slug: string): Trade | undefined {
  return TRADES.find((t) => t.slug === slug);
}
