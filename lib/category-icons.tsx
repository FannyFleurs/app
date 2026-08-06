import {
  Flower, Rose, Flower2, Leaf, LeafyGreen, Clover, Sprout, Wheat,
  TreeDeciduous, Trees, TreePalm, TreePine,
  Shovel, Bean, Droplets, Sun, Warehouse, Mountain, Umbrella, Snowflake,
  Gift, Ribbon, Heart, HeartHandshake, Balloon, PartyPopper, Mail, CreditCard, Ticket, Crown,
  Amphora, Flame, Lamp, Frame, Sofa, Armchair, Utensils, Clock, ShoppingBasket, Bath, House,
  Apple, Carrot, Grape, Citrus, Cherry, Banana, Salad, Soup, Beef, Drumstick, Fish, Egg,
  Milk, CookingPot, Nut, Vegan,
  Croissant, Cake, CakeSlice, Cookie, Donut, Candy, IceCream, Popcorn, Lollipop,
  Wine, BottleWine, Beer, Coffee, CupSoda, Martini, Droplet, Barrel,
  SprayCan, SoapDispenserDroplet, Scissors, Brush, Hand, Waves, ShowerHead,
  Shirt, Footprints, Handbag, Backpack, HatGlasses, Gem, Watch, Glasses,
  PawPrint, Dog, Cat, Bird, FishSymbol, Rabbit, Turtle, Bone,
  Book, Music, Guitar, Palette, Gamepad2, Puzzle, Camera, Volleyball, Bike, Film, ToyBrick, Trophy,
  Truck, GraduationCap, Repeat, Wrench, Hammer, CalendarDays, Church, Phone, Printer, Handshake,
  Tag, Percent, Star, Package, ShoppingCart, ShoppingBag, Euro, Receipt, Store, Wallet,
  Ellipsis, LayoutGrid, Bookmark, Sparkles, Flag, Circle, Shapes, Boxes, Diamond, Bell,
  type LucideIcon,
} from 'lucide-react';

/**
 * Bibliothèque d'icônes pour les tuiles de catégorie en caisse.
 *
 * Les dessins viennent de Lucide — jeu d'icônes ouvert, maintenu et cohérent,
 * plutôt que des tracés maison qu'il faudrait redessiner à chaque besoin. Les
 * imports sont nominatifs : seules les icônes listées ici entrent dans le
 * bundle, pas les milliers du paquet.
 *
 * Ce fichier ne fait que CHOISIR et NOMMER en français : chaque entrée associe
 * une clé stable, un libellé métier et un rayon. La clé est ce qui est stocké
 * en base — ne jamais la renommer, sous peine de délier les catégories
 * existantes de leur dessin. Pour retirer une icône, ajouter plutôt une entrée
 * dans `ALIASES` : la clé continue alors de fonctionner en pointant vers le
 * dessin le plus proche.
 */

export interface CategoryIconDef {
  /** Clé stockée en base. Immuable. */
  key: string;
  /** Libellé français, utilisé par la recherche du sélecteur. */
  label: string;
  group: string;
  /** Mots-clés supplémentaires pour retrouver l'icône sans connaître son nom. */
  tags?: string;
  Icon: LucideIcon;
}

/* Ordre d'affichage des rayons dans le sélecteur : du plus probable au plus
   spécialisé pour le métier d'origine (fleuriste), puis les autres commerces. */
export const CATEGORY_ICON_GROUPS = [
  'Fleurs & végétaux',
  'Jardin & extérieur',
  'Événements & cadeaux',
  'Maison & décoration',
  'Alimentation',
  'Boulangerie & pâtisserie',
  'Boissons',
  'Beauté & soin',
  'Mode & accessoires',
  'Animaux',
  'Loisirs & culture',
  'Services & atelier',
  'Commerce',
  'Repères',
] as const;

export const CATEGORY_ICONS: CategoryIconDef[] = [
  /* ------------------------------------------------ Fleurs & végétaux */
  { key: 'flower', label: 'Fleur', group: 'Fleurs & végétaux', tags: 'marguerite pâquerette', Icon: Flower },
  { key: 'rose', label: 'Rose', group: 'Fleurs & végétaux', tags: 'roseraie', Icon: Rose },
  { key: 'flower-stem', label: 'Fleur coupée', group: 'Fleurs & végétaux', tags: 'tulipe bouquet tige gerbe', Icon: Flower2 },
  { key: 'leaf', label: 'Feuille', group: 'Fleurs & végétaux', tags: 'verdure', Icon: Leaf },
  { key: 'foliage', label: 'Feuillage', group: 'Fleurs & végétaux', tags: 'eucalyptus branche fougère', Icon: LeafyGreen },
  { key: 'clover', label: 'Trèfle', group: 'Fleurs & végétaux', tags: 'porte-bonheur', Icon: Clover },
  { key: 'sprout', label: 'Pousse', group: 'Fleurs & végétaux', tags: 'semis plante jeune plant cactus', Icon: Sprout },
  { key: 'wheat', label: 'Épis & fleurs séchées', group: 'Fleurs & végétaux', tags: 'blé pampa lavande stabilisé', Icon: Wheat },
  { key: 'tree', label: 'Arbre', group: 'Fleurs & végétaux', tags: 'arbuste', Icon: TreeDeciduous },
  { key: 'trees', label: 'Arbres', group: 'Fleurs & végétaux', tags: 'bosquet pépinière', Icon: Trees },
  { key: 'palm', label: 'Palmier', group: 'Fleurs & végétaux', tags: 'exotique tropical', Icon: TreePalm },
  { key: 'pine', label: 'Sapin', group: 'Fleurs & végétaux', tags: 'noël conifère', Icon: TreePine },

  /* ---------------------------------------------- Jardin & extérieur */
  { key: 'shovel', label: 'Outils de jardin', group: 'Jardin & extérieur', tags: 'pelle bêche', Icon: Shovel },
  { key: 'seeds', label: 'Graines', group: 'Jardin & extérieur', tags: 'semences bulbes', Icon: Bean },
  { key: 'watering', label: 'Arrosage', group: 'Jardin & extérieur', tags: 'arrosoir eau', Icon: Droplets },
  { key: 'sun', label: 'Extérieur', group: 'Jardin & extérieur', tags: 'soleil plein air terrasse', Icon: Sun },
  { key: 'greenhouse', label: 'Serre', group: 'Jardin & extérieur', tags: 'abri dépôt', Icon: Warehouse },
  { key: 'nature', label: 'Nature', group: 'Jardin & extérieur', tags: 'montagne paysage', Icon: Mountain },
  { key: 'parasol', label: 'Parasol', group: 'Jardin & extérieur', tags: 'ombrage pluie', Icon: Umbrella },
  { key: 'winter', label: 'Hiver', group: 'Jardin & extérieur', tags: 'saison neige', Icon: Snowflake },

  /* ------------------------------------------- Événements & cadeaux */
  { key: 'gift', label: 'Cadeau', group: 'Événements & cadeaux', tags: 'paquet emballage', Icon: Gift },
  { key: 'ribbon', label: 'Ruban', group: 'Événements & cadeaux', tags: 'deuil condoléances soutien', Icon: Ribbon },
  { key: 'heart', label: 'Amour', group: 'Événements & cadeaux', tags: 'saint-valentin cœur', Icon: Heart },
  { key: 'wedding', label: 'Mariage', group: 'Événements & cadeaux', tags: 'noces union', Icon: HeartHandshake },
  { key: 'balloon', label: 'Fête', group: 'Événements & cadeaux', tags: 'ballon anniversaire', Icon: Balloon },
  { key: 'confetti', label: 'Célébration', group: 'Événements & cadeaux', tags: 'confettis fête', Icon: PartyPopper },
  { key: 'card', label: 'Carte de vœux', group: 'Événements & cadeaux', tags: 'message mot enveloppe', Icon: Mail },
  { key: 'gift-card', label: 'Carte cadeau', group: 'Événements & cadeaux', tags: 'bon achat avoir', Icon: CreditCard },
  { key: 'ticket', label: 'Billetterie', group: 'Événements & cadeaux', tags: 'entrée place', Icon: Ticket },
  { key: 'crown', label: 'Couronne', group: 'Événements & cadeaux', tags: 'prestige deuil roi', Icon: Crown },

  /* ------------------------------------------- Maison & décoration */
  { key: 'vase', label: 'Vase & cache-pot', group: 'Maison & décoration', tags: 'poterie contenant amphore', Icon: Amphora },
  { key: 'candle', label: 'Bougie', group: 'Maison & décoration', tags: 'cire flamme parfum', Icon: Flame },
  { key: 'lamp', label: 'Luminaire', group: 'Maison & décoration', tags: 'lampe éclairage', Icon: Lamp },
  { key: 'frame', label: 'Cadre', group: 'Maison & décoration', tags: 'tableau affiche art', Icon: Frame },
  { key: 'sofa', label: 'Mobilier', group: 'Maison & décoration', tags: 'canapé textile coussin', Icon: Sofa },
  { key: 'armchair', label: 'Fauteuil', group: 'Maison & décoration', tags: 'siège salon', Icon: Armchair },
  { key: 'tableware', label: 'Art de la table', group: 'Maison & décoration', tags: 'vaisselle couverts', Icon: Utensils },
  { key: 'clock', label: 'Horlogerie', group: 'Maison & décoration', tags: 'horloge pendule', Icon: Clock },
  { key: 'basket', label: 'Panier', group: 'Maison & décoration', tags: 'osier corbeille', Icon: ShoppingBasket },
  { key: 'bath', label: 'Salle de bain', group: 'Maison & décoration', tags: 'baignoire sanitaire', Icon: Bath },
  { key: 'house', label: 'Maison', group: 'Maison & décoration', tags: 'intérieur habitat', Icon: House },

  /* ------------------------------------------------------ Alimentation */
  { key: 'fruit', label: 'Fruits', group: 'Alimentation', tags: 'pomme verger', Icon: Apple },
  { key: 'vegetable', label: 'Légumes', group: 'Alimentation', tags: 'carotte primeur', Icon: Carrot },
  { key: 'grapes', label: 'Raisin', group: 'Alimentation', tags: 'vigne', Icon: Grape },
  { key: 'citrus', label: 'Agrumes', group: 'Alimentation', tags: 'orange citron', Icon: Citrus },
  { key: 'cherry', label: 'Cerises', group: 'Alimentation', tags: 'fruits rouges', Icon: Cherry },
  { key: 'banana', label: 'Banane', group: 'Alimentation', tags: 'exotique', Icon: Banana },
  { key: 'salad', label: 'Traiteur', group: 'Alimentation', tags: 'salade plat préparé', Icon: Salad },
  { key: 'soup', label: 'Soupes & plats', group: 'Alimentation', tags: 'potage bol', Icon: Soup },
  { key: 'meat', label: 'Boucherie', group: 'Alimentation', tags: 'viande charcuterie', Icon: Beef },
  { key: 'poultry', label: 'Volaille', group: 'Alimentation', tags: 'poulet rôtisserie', Icon: Drumstick },
  { key: 'fish', label: 'Poissonnerie', group: 'Alimentation', tags: 'poisson marée', Icon: Fish },
  { key: 'egg', label: 'Œufs', group: 'Alimentation', tags: 'ferme', Icon: Egg },
  { key: 'dairy', label: 'Crémerie', group: 'Alimentation', tags: 'lait fromage beurre yaourt', Icon: Milk },
  { key: 'grocery', label: 'Épicerie', group: 'Alimentation', tags: 'conserve miel confiture bocal', Icon: CookingPot },
  { key: 'nuts', label: 'Fruits secs & épices', group: 'Alimentation', tags: 'noix condiment aromates', Icon: Nut },
  { key: 'vegan', label: 'Bio & végétal', group: 'Alimentation', tags: 'vegan naturel', Icon: Vegan },

  /* ------------------------------------ Boulangerie & pâtisserie */
  { key: 'croissant', label: 'Boulangerie & viennoiserie', group: 'Boulangerie & pâtisserie', tags: 'pain croissant baguette', Icon: Croissant },
  { key: 'cake', label: 'Gâteau', group: 'Boulangerie & pâtisserie', tags: 'anniversaire pièce montée', Icon: Cake },
  { key: 'cake-slice', label: 'Pâtisserie', group: 'Boulangerie & pâtisserie', tags: 'part tarte cupcake', Icon: CakeSlice },
  { key: 'cookie', label: 'Biscuits', group: 'Boulangerie & pâtisserie', tags: 'sablés cookie', Icon: Cookie },
  { key: 'donut', label: 'Donuts', group: 'Boulangerie & pâtisserie', tags: 'beignet', Icon: Donut },
  { key: 'chocolate', label: 'Confiserie', group: 'Boulangerie & pâtisserie', tags: 'chocolat bonbon', Icon: Candy },
  { key: 'ice-cream', label: 'Glaces', group: 'Boulangerie & pâtisserie', tags: 'sorbet crème glacée', Icon: IceCream },
  { key: 'popcorn', label: 'Snacks', group: 'Boulangerie & pâtisserie', tags: 'apéritif grignotage', Icon: Popcorn },
  { key: 'lollipop', label: 'Sucreries', group: 'Boulangerie & pâtisserie', tags: 'sucette enfant', Icon: Lollipop },

  /* ------------------------------------------------------- Boissons */
  { key: 'wine', label: 'Vin', group: 'Boissons', tags: 'cave verre', Icon: Wine },
  { key: 'bottle', label: 'Bouteille', group: 'Boissons', tags: 'jus sirop huile', Icon: BottleWine },
  { key: 'beer', label: 'Bière', group: 'Boissons', tags: 'brasserie', Icon: Beer },
  { key: 'coffee', label: 'Café', group: 'Boissons', tags: 'torréfaction expresso', Icon: Coffee },
  { key: 'tea', label: 'Thé & infusion', group: 'Boissons', tags: 'tisane gobelet', Icon: CupSoda },
  { key: 'cocktail', label: 'Cocktail', group: 'Boissons', tags: 'apéritif spiritueux', Icon: Martini },
  { key: 'water', label: 'Eau', group: 'Boissons', tags: 'source minérale', Icon: Droplet },
  { key: 'barrel', label: 'Fût & cave', group: 'Boissons', tags: 'tonneau vrac', Icon: Barrel },

  /* --------------------------------------------------- Beauté & soin */
  { key: 'perfume', label: 'Parfum', group: 'Beauté & soin', tags: 'vaporisateur eau de toilette', Icon: SprayCan },
  { key: 'soap', label: 'Savonnerie', group: 'Beauté & soin', tags: 'savon hygiène cosmétique crème', Icon: SoapDispenserDroplet },
  { key: 'hair', label: 'Coiffure', group: 'Beauté & soin', tags: 'ciseaux salon', Icon: Scissors },
  { key: 'makeup', label: 'Maquillage', group: 'Beauté & soin', tags: 'pinceau rouge à lèvres', Icon: Brush },
  { key: 'hands', label: 'Soin des mains', group: 'Beauté & soin', tags: 'ongles manucure gants', Icon: Hand },
  { key: 'wellness', label: 'Bien-être', group: 'Beauté & soin', tags: 'spa massage détente', Icon: Waves },
  { key: 'shower', label: 'Douche & bain', group: 'Beauté & soin', tags: 'gel douche', Icon: ShowerHead },

  /* ---------------------------------------------- Mode & accessoires */
  { key: 'clothing', label: 'Vêtements', group: 'Mode & accessoires', tags: 'tshirt robe prêt-à-porter', Icon: Shirt },
  { key: 'shoe', label: 'Chaussures', group: 'Mode & accessoires', tags: 'souliers', Icon: Footprints },
  { key: 'bag', label: 'Maroquinerie', group: 'Mode & accessoires', tags: 'sac cuir', Icon: Handbag },
  { key: 'backpack', label: 'Sacs à dos', group: 'Mode & accessoires', tags: 'bagagerie', Icon: Backpack },
  { key: 'hat-glasses', label: 'Accessoires', group: 'Mode & accessoires', tags: 'chapeau lunettes chapellerie', Icon: HatGlasses },
  { key: 'jewelry', label: 'Bijoux', group: 'Mode & accessoires', tags: 'joaillerie bague pierre', Icon: Gem },
  { key: 'watch', label: 'Montres', group: 'Mode & accessoires', tags: 'horlogerie poignet', Icon: Watch },
  { key: 'glasses', label: 'Lunettes', group: 'Mode & accessoires', tags: 'optique solaire', Icon: Glasses },

  /* -------------------------------------------------------- Animaux */
  { key: 'paw', label: 'Animalerie', group: 'Animaux', tags: 'patte chien chat', Icon: PawPrint },
  { key: 'dog', label: 'Chien', group: 'Animaux', tags: 'canin', Icon: Dog },
  { key: 'cat', label: 'Chat', group: 'Animaux', tags: 'félin', Icon: Cat },
  { key: 'bird', label: 'Oiseaux', group: 'Animaux', tags: 'volière', Icon: Bird },
  { key: 'fish-pet', label: 'Aquariophilie', group: 'Animaux', tags: 'poisson aquarium', Icon: FishSymbol },
  { key: 'rabbit', label: 'Rongeurs', group: 'Animaux', tags: 'lapin hamster', Icon: Rabbit },
  { key: 'turtle', label: 'Reptiles', group: 'Animaux', tags: 'tortue terrarium', Icon: Turtle },
  { key: 'bone', label: 'Alimentation animale', group: 'Animaux', tags: 'os croquettes friandise', Icon: Bone },

  /* -------------------------------------------- Loisirs & culture */
  { key: 'book', label: 'Librairie', group: 'Loisirs & culture', tags: 'livre papeterie', Icon: Book },
  { key: 'music', label: 'Musique', group: 'Loisirs & culture', tags: 'disque partition', Icon: Music },
  { key: 'guitar', label: 'Instruments', group: 'Loisirs & culture', tags: 'guitare musique', Icon: Guitar },
  { key: 'art', label: 'Loisirs créatifs', group: 'Loisirs & culture', tags: 'peinture palette art', Icon: Palette },
  { key: 'game', label: 'Jeux vidéo', group: 'Loisirs & culture', tags: 'manette console', Icon: Gamepad2 },
  { key: 'puzzle', label: 'Jeux & puzzles', group: 'Loisirs & culture', tags: 'société casse-tête', Icon: Puzzle },
  { key: 'toy', label: 'Jouets', group: 'Loisirs & culture', tags: 'enfant brique', Icon: ToyBrick },
  { key: 'photo', label: 'Photo', group: 'Loisirs & culture', tags: 'appareil image', Icon: Camera },
  { key: 'film', label: 'Cinéma', group: 'Loisirs & culture', tags: 'vidéo dvd', Icon: Film },
  { key: 'sport', label: 'Sport', group: 'Loisirs & culture', tags: 'ballon activité', Icon: Volleyball },
  { key: 'bike', label: 'Cycles', group: 'Loisirs & culture', tags: 'vélo', Icon: Bike },
  { key: 'trophy', label: 'Compétition', group: 'Loisirs & culture', tags: 'trophée récompense', Icon: Trophy },

  /* ------------------------------------------- Services & atelier */
  { key: 'delivery', label: 'Livraison', group: 'Services & atelier', tags: 'camion transport', Icon: Truck },
  { key: 'workshop', label: 'Atelier & cours', group: 'Services & atelier', tags: 'formation stage', Icon: GraduationCap },
  { key: 'subscription', label: 'Abonnement', group: 'Services & atelier', tags: 'récurrent formule', Icon: Repeat },
  { key: 'repair', label: 'Réparation', group: 'Services & atelier', tags: 'entretien SAV', Icon: Wrench },
  { key: 'tools', label: 'Outillage', group: 'Services & atelier', tags: 'bricolage marteau', Icon: Hammer },
  { key: 'appointment', label: 'Rendez-vous', group: 'Services & atelier', tags: 'agenda calendrier', Icon: CalendarDays },
  { key: 'funeral', label: 'Deuil', group: 'Services & atelier', tags: 'obsèques condoléances', Icon: Church },
  { key: 'phone', label: 'Commande téléphone', group: 'Services & atelier', tags: 'appel réservation', Icon: Phone },
  { key: 'printing', label: 'Impression', group: 'Services & atelier', tags: 'copie tirage', Icon: Printer },
  { key: 'service', label: 'Prestation', group: 'Services & atelier', tags: 'main-d\'œuvre accord', Icon: Handshake },

  /* -------------------------------------------------------- Commerce */
  { key: 'tag', label: 'Étiquette', group: 'Commerce', tags: 'prix promo', Icon: Tag },
  { key: 'sale', label: 'Promotions', group: 'Commerce', tags: 'soldes remise pourcentage', Icon: Percent },
  { key: 'star', label: 'Nouveautés', group: 'Commerce', tags: 'coup de cœur vedette', Icon: Star },
  { key: 'box', label: 'Colis', group: 'Commerce', tags: 'carton expédition stock', Icon: Package },
  { key: 'cart', label: 'Divers', group: 'Commerce', tags: 'panier achats chariot', Icon: ShoppingCart },
  { key: 'shopping-bag', label: 'Sac boutique', group: 'Commerce', tags: 'emplettes', Icon: ShoppingBag },
  { key: 'euro', label: 'Divers payant', group: 'Commerce', tags: 'prix euro monnaie', Icon: Euro },
  { key: 'receipt', label: 'Ticket & bon', group: 'Commerce', tags: 'reçu note', Icon: Receipt },
  { key: 'store', label: 'Boutique', group: 'Commerce', tags: 'magasin enseigne', Icon: Store },
  { key: 'wallet', label: 'Compte client', group: 'Commerce', tags: 'porte-monnaie solde', Icon: Wallet },

  /* --------------------------------------------------------- Repères */
  { key: 'dots', label: 'Autres', group: 'Repères', tags: 'sans catégorie divers', Icon: Ellipsis },
  { key: 'grid', label: 'Rayon', group: 'Repères', tags: 'grille sections', Icon: LayoutGrid },
  { key: 'bookmark', label: 'Sélection', group: 'Repères', tags: 'marque-page favoris', Icon: Bookmark },
  { key: 'sparkle', label: 'Éphémère', group: 'Repères', tags: 'saison nouveauté étincelle', Icon: Sparkles },
  { key: 'flag', label: 'Temps forts', group: 'Repères', tags: 'drapeau événement', Icon: Flag },
  { key: 'circle', label: 'Neutre', group: 'Repères', tags: 'rond simple', Icon: Circle },
  { key: 'shapes', label: 'Assortiment', group: 'Repères', tags: 'formes mélange', Icon: Shapes },
  { key: 'boxes', label: 'Lots', group: 'Repères', tags: 'ensembles paquets', Icon: Boxes },
  { key: 'diamond', label: 'Premium', group: 'Repères', tags: 'haut de gamme luxe', Icon: Diamond },
  { key: 'bell', label: 'À signaler', group: 'Repères', tags: 'alerte rappel', Icon: Bell },
];

/**
 * Clés d'anciennes icônes maison, redirigées vers leur équivalent Lucide le
 * plus proche.
 *
 * Le passage à Lucide a fondu certains dessins (« tulipe » et « bouquet »
 * partagent la fleur coupée) et en a écarté quelques-uns que la bibliothèque
 * ne propose pas. Sans cette table, une catégorie déjà paramétrée se
 * retrouverait sans icône du jour au lendemain, sans que personne ne comprenne
 * pourquoi. Ces clés ne sont pas proposées dans le sélecteur : elles ne
 * servent qu'à honorer l'existant.
 */
const ALIASES: Record<string, string> = {
  tulip: 'flower-stem',
  bouquet: 'flower-stem',
  orchid: 'flower-stem',
  sunflower: 'flower',
  'dried-flower': 'wheat',
  fern: 'foliage',
  plant: 'sprout',
  cactus: 'sprout',
  seedling: 'sprout',
  wreath: 'crown',
  'watering-can': 'watering',
  gloves: 'hands',
  pot: 'vase',
  cushion: 'sofa',
  cheese: 'dairy',
  honey: 'grocery',
  spice: 'nuts',
  'basket-food': 'basket',
  bread: 'croissant',
  cupcake: 'cake-slice',
  cosmetics: 'soap',
  lipstick: 'makeup',
  nails: 'hands',
  dress: 'clothing',
  hat: 'hat-glasses',
  aquarium: 'fish-pet',
};

const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i]));

export function categoryIconDef(key: string | null | undefined): CategoryIconDef | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? BY_KEY.get(ALIASES[key] ?? '') ?? null;
}

/**
 * Rend l'icône d'une catégorie. Renvoie `null` si la clé est vide ou inconnue —
 * l'appelant décide alors quoi afficher à la place, plutôt que de recevoir un
 * carré vide.
 */
export default function CategoryIcon({
  name, size = 24, className, strokeWidth = 1.6,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const def = categoryIconDef(name);
  if (!def) return null;
  const { Icon } = def;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
