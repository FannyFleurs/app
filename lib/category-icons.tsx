/**
 * Bibliothèque d'icônes pour les tuiles de catégorie en caisse.
 *
 * Séparée de `components/Icon.tsx` — qui sert la navigation et ne bouge
 * quasiment jamais — parce qu'elle répond à un besoin différent : couvrir les
 * rayons de commerces très variés (fleuriste, épicerie, cave, salon, boutique
 * de mode, animalerie…), et donc grossir au fil des métiers rencontrés.
 *
 * Même parti pris que le reste du projet : SVG inline, aucune dépendance
 * externe. Tout est dessiné en traits (24×24, `currentColor`) pour prendre la
 * couleur du contexte et rester lisible à petite comme à grande taille.
 *
 * Ajouter une icône : une entrée dans `CATEGORY_ICONS`. La clé est ce qui est
 * stocké en base — ne jamais la renommer, sous peine de délier les catégories
 * existantes de leur dessin. Retirer une icône est en revanche sans danger :
 * une clé inconnue dégrade vers l'absence d'icône.
 */

export interface CategoryIconDef {
  /** Clé stockée en base. Immuable. */
  key: string;
  /** Libellé français, utilisé par la recherche du sélecteur. */
  label: string;
  group: string;
  /** Mots-clés supplémentaires pour retrouver l'icône sans connaître son nom. */
  tags?: string;
  art: React.ReactNode;
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
  {
    key: 'flower', label: 'Fleur', group: 'Fleurs & végétaux', tags: 'marguerite pâquerette',
    art: (
      <>
        <circle cx="12" cy="9" r="2" />
        <path d="M12 7c0-2-1.5-3.5-3-3s-1.5 2.5 0 3.5" />
        <path d="M12 7c0-2 1.5-3.5 3-3s1.5 2.5 0 3.5" />
        <path d="M10.3 10.2c-1.7 1-3.7.7-4.2-.8s1.2-2.4 2.9-1.9" />
        <path d="M13.7 10.2c1.7 1 3.7.7 4.2-.8s-1.2-2.4-2.9-1.9" />
        <path d="M12 11v10" />
        <path d="M12 16c-2 0-3.5-1.2-3.5-2.8 1.9-.3 3.5.9 3.5 2.8Z" />
      </>
    ),
  },
  {
    key: 'rose', label: 'Rose', group: 'Fleurs & végétaux',
    art: (
      <>
        {/* Bouton en spirale : trois tours resserrés, la signature de la rose. */}
        <path d="M12 3.2a5.3 5.3 0 1 0 5.3 5.3" />
        <path d="M17.3 8.5a3.4 3.4 0 1 0-3.4-3.4" />
        <path d="M13.9 5.1A1.9 1.9 0 1 0 12 7" />
        <path d="M12 13.8V21" />
        <path d="M12 17.5c-2.2 0-4-1.3-4-3 2.2-.4 4 1 4 3Z" />
      </>
    ),
  },
  {
    key: 'tulip', label: 'Tulipe', group: 'Fleurs & végétaux',
    art: (
      <>
        <path d="M8 6.5c0-1.4 1.8-2.5 4-2.5s4 1.1 4 2.5v2a4 4 0 0 1-8 0Z" />
        <path d="M12 4v4.5" />
        <path d="M12 12.5V21" />
        <path d="M12 17c-2.2 0-4-1.3-4-3 2.2-.4 4 1 4 3Z" />
      </>
    ),
  },
  {
    key: 'bouquet', label: 'Bouquet', group: 'Fleurs & végétaux', tags: 'gerbe composition',
    art: (
      <>
        <circle cx="8" cy="6.5" r="2.2" />
        <circle cx="16" cy="6.5" r="2.2" />
        <circle cx="12" cy="4.5" r="2.2" />
        <path d="M8.6 8.6 11 14M15.4 8.6 13 14M12 6.7V14" />
        <path d="M9 14h6l-1.2 6.2a1 1 0 0 1-1 .8h-1.6a1 1 0 0 1-1-.8Z" />
      </>
    ),
  },
  {
    key: 'sunflower', label: 'Tournesol', group: 'Fleurs & végétaux',
    art: (
      <>
        <circle cx="12" cy="9" r="2.6" />
        <path d="M12 3.2v3.2M12 11.6v3.2M6.2 9h3.2M14.6 9h3.2M8 5l2.2 2.2M13.8 10.8 16 13M16 5l-2.2 2.2M10.2 10.8 8 13" />
        <path d="M12 14.8V21" />
      </>
    ),
  },
  {
    key: 'orchid', label: 'Orchidée', group: 'Fleurs & végétaux',
    art: (
      <>
        <path d="M12 4c-1.8 0-3 1.3-3 2.8S10.2 9.5 12 9.5s3-1.2 3-2.7S13.8 4 12 4Z" />
        <circle cx="12" cy="7" r="1" />
        <path d="M9 9.5c-2 0-3.4 1.1-3.4 2.4S7 14 9 13.4" />
        <path d="M15 9.5c2 0 3.4 1.1 3.4 2.4S17 14 15 13.4" />
        <path d="M12 9.5V21" />
      </>
    ),
  },
  {
    key: 'dried-flower', label: 'Fleurs séchées', group: 'Fleurs & végétaux', tags: 'stabilisé lavande pampa',
    art: (
      <>
        {/* Botte de trois épis liés : lavande, pampa, blé — le séché en bouquet. */}
        <path d="M12 21v-7" />
        <path d="M12 15.5 8.6 11M12 15.5 15.4 11" />
        <ellipse cx="12" cy="9" rx="1.7" ry="3.6" />
        <ellipse cx="7.4" cy="8" rx="1.4" ry="2.9" transform="rotate(-28 7.4 8)" />
        <ellipse cx="16.6" cy="8" rx="1.4" ry="2.9" transform="rotate(28 16.6 8)" />
      </>
    ),
  },
  {
    key: 'leaf', label: 'Feuille', group: 'Fleurs & végétaux', tags: 'feuillage verdure',
    art: (
      <>
        <path d="M4 20c0-8 5-14 16-14 0 9-5.5 14-12 14H4Z" />
        <path d="M4 20c3.5-4 7-7 12-9" />
      </>
    ),
  },
  {
    key: 'foliage', label: 'Feuillage', group: 'Fleurs & végétaux', tags: 'eucalyptus branche',
    art: (
      <>
        {/* Eucalyptus : des feuilles rondes réparties le long d'une tige. */}
        <path d="M4.5 21C6.5 13.5 11 7.5 19.5 4" />
        <circle cx="8.4" cy="14.6" r="2" />
        <circle cx="11.6" cy="10.6" r="2" />
        <circle cx="15.4" cy="7.4" r="2" />
        <circle cx="12.8" cy="15.2" r="1.7" />
        <circle cx="16.2" cy="11.6" r="1.7" />
      </>
    ),
  },
  {
    key: 'plant', label: 'Plante en pot', group: 'Fleurs & végétaux', tags: 'plante verte intérieur',
    art: (
      <>
        <path d="M12 12c0-4 2.5-6.5 6-6.5 0 4-2.6 6.5-6 6.5Z" />
        <path d="M12 12c0-3.4-2.2-5.5-5-5.5 0 3.4 2.2 5.5 5 5.5Z" />
        <path d="M12 12v3" />
        <path d="M6.5 15h11l-1 5.2a1 1 0 0 1-1 .8H8.5a1 1 0 0 1-1-.8Z" />
      </>
    ),
  },
  {
    key: 'tree', label: 'Arbre', group: 'Fleurs & végétaux', tags: 'arbuste',
    art: (
      <>
        <path d="M12 3 5 13h4l-3 5h12l-3-5h4Z" />
        <path d="M12 18v3" />
      </>
    ),
  },
  {
    key: 'cactus', label: 'Cactus', group: 'Fleurs & végétaux', tags: 'succulente',
    art: (
      <>
        <path d="M10 21V6a2 2 0 0 1 4 0v15" />
        <path d="M10 12H8a2 2 0 0 1-2-2V8" />
        <path d="M14 14h2a2 2 0 0 0 2-2v-3" />
        <path d="M8 21h8" />
      </>
    ),
  },
  {
    key: 'seedling', label: 'Pousse', group: 'Fleurs & végétaux', tags: 'semis jeune plant',
    art: (
      <>
        <path d="M12 21v-8" />
        <path d="M12 13c0-3 2-5 5-5 0 3-2 5-5 5Z" />
        <path d="M12 15c0-2.6-1.8-4.4-4.4-4.4 0 2.6 1.8 4.4 4.4 4.4Z" />
      </>
    ),
  },
  {
    key: 'wreath', label: 'Couronne', group: 'Fleurs & végétaux', tags: 'deuil obsèques',
    art: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 4.5v2M19.5 12h-2M12 19.5v-2M4.5 12h2M6.7 6.7l1.4 1.4M17.3 6.7l-1.4 1.4M17.3 17.3l-1.4-1.4M6.7 17.3l1.4-1.4" />
      </>
    ),
  },
  {
    key: 'palm', label: 'Palmier', group: 'Fleurs & végétaux', tags: 'exotique tropical',
    art: (
      <>
        <path d="M12 21V9" />
        <path d="M12 9c-3.5-2-6.5-1-8 1.5" />
        <path d="M12 9c3.5-2 6.5-1 8 1.5" />
        <path d="M12 9c-1.5-3.2-4-4.5-6.5-4" />
        <path d="M12 9c1.5-3.2 4-4.5 6.5-4" />
      </>
    ),
  },
  {
    key: 'fern', label: 'Fougère', group: 'Fleurs & végétaux',
    art: (
      <>
        <path d="M12 21V4" />
        <path d="M12 7 8.5 5M12 7l3.5-2M12 11l-4.5-2.5M12 11l4.5-2.5M12 15l-4-2M12 15l4-2M12 18.5l-3-1.5M12 18.5l3-1.5" />
      </>
    ),
  },

  /* ---------------------------------------------- Jardin & extérieur */
  {
    key: 'watering-can', label: 'Arrosoir', group: 'Jardin & extérieur',
    art: (
      <>
        <path d="M6 10h8a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a2 2 0 0 1 2-2Z" />
        <path d="M16 13.5 21 10l-1 6" />
        <path d="M8 10V8.5A2.5 2.5 0 0 1 10.5 6h1" />
      </>
    ),
  },
  {
    key: 'seeds', label: 'Graines', group: 'Jardin & extérieur', tags: 'semences bulbes',
    art: (
      <>
        <path d="M7 8h10l-1 11a2 2 0 0 1-2 1.8h-4A2 2 0 0 1 8 19Z" />
        <path d="M7 8V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V8" />
        <circle cx="10.5" cy="13" r="1.2" />
        <circle cx="13.8" cy="15.5" r="1.2" />
      </>
    ),
  },
  {
    key: 'shovel', label: 'Outils de jardin', group: 'Jardin & extérieur', tags: 'pelle bêche',
    art: (
      <>
        <path d="M14.5 3.5 20.5 9.5" />
        <path d="M17.5 6.5 9 15" />
        <path d="M9 15l-3.5 1.2a1 1 0 0 0-.6 1.4l1.5 3a1 1 0 0 0 1.5.3L11 18Z" />
      </>
    ),
  },
  {
    key: 'gloves', label: 'Gants', group: 'Jardin & extérieur',
    art: (
      <>
        <path d="M7 21v-5.5C5.5 15 5 13.8 5 12.5V8a1.5 1.5 0 0 1 3 0v2" />
        <path d="M8 10V5.5a1.5 1.5 0 0 1 3 0V10" />
        <path d="M11 10V6.5a1.5 1.5 0 0 1 3 0v5" />
        <path d="M14 11.5c0-1.4 1-2.5 2.5-2.5S19 10 19 11.5c0 4-1.5 6.5-4 9.5H7" />
      </>
    ),
  },
  {
    key: 'greenhouse', label: 'Serre', group: 'Jardin & extérieur',
    art: (
      <>
        <path d="M4 20V9l8-5 8 5v11Z" />
        <path d="M12 4v16M4 12h16" />
      </>
    ),
  },
  {
    key: 'sun', label: 'Extérieur', group: 'Jardin & extérieur', tags: 'soleil plein air terrasse',
    art: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
      </>
    ),
  },

  /* ------------------------------------------- Événements & cadeaux */
  {
    key: 'gift', label: 'Cadeau', group: 'Événements & cadeaux', tags: 'paquet emballage',
    art: (
      <>
        <rect x="3.5" y="9.5" width="17" height="11" rx="1.5" />
        <path d="M2.5 9.5h19M12 9.5V20.5" />
        <path d="M12 9.5C10.5 7 8.5 5.5 7 6.2S6 9 8.5 9.5h3.5Z" />
        <path d="M12 9.5c1.5-2.5 3.5-4 5-3.3s1 2.8-1.5 3.3H12Z" />
      </>
    ),
  },
  {
    key: 'ribbon', label: 'Ruban', group: 'Événements & cadeaux', tags: 'deuil condoléances soutien',
    art: (
      <>
        {/* Ruban de soutien : boucle haute, deux pans croisés qui retombent. */}
        <path d="M12 14.5c3.2-2.8 4.8-5.3 4.8-7.5A4.8 4.8 0 0 0 12 2.5a4.8 4.8 0 0 0-4.8 4.5c0 2.2 1.6 4.7 4.8 7.5Z" />
        <path d="M10.2 12.8 7 21" />
        <path d="M13.8 12.8 17 21" />
      </>
    ),
  },
  {
    key: 'heart', label: 'Amour', group: 'Événements & cadeaux', tags: 'saint-valentin cœur',
    art: (
      <path d="M12 20s-7.5-4.7-7.5-9.8A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7.5 2.7C19.5 15.3 12 20 12 20Z" />
    ),
  },
  {
    key: 'wedding', label: 'Mariage', group: 'Événements & cadeaux', tags: 'alliances noces',
    art: (
      <>
        <circle cx="9" cy="14" r="5" />
        <circle cx="15" cy="14" r="5" />
        <path d="m15 4.2 1.7 2.1-1.7 2.1-1.7-2.1Z" />
      </>
    ),
  },
  {
    key: 'balloon', label: 'Fête', group: 'Événements & cadeaux', tags: 'ballon anniversaire',
    art: (
      <>
        <path d="M12 14.5c3 0 5.5-2.7 5.5-6S15 3 12 3 6.5 5.2 6.5 8.5s2.5 6 5.5 6Z" />
        <path d="M12 14.5v1.5" />
        <path d="M12 16c-1.5 1.5-1.5 3.5 0 5" />
      </>
    ),
  },
  {
    key: 'card', label: 'Carte de vœux', group: 'Événements & cadeaux', tags: 'message mot',
    art: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="M3 8.5 12 14l9-5.5" />
      </>
    ),
  },
  {
    key: 'confetti', label: 'Célébration', group: 'Événements & cadeaux', tags: 'confettis fête',
    art: (
      <>
        <path d="M4 20 9 8l7 7Z" />
        <path d="M14 4.5v2M18.5 6l-1.4 1.4M20 11h-2" />
        <circle cx="17" cy="14" r="1" />
        <circle cx="11" cy="4" r="1" />
      </>
    ),
  },
  {
    key: 'gift-card', label: 'Carte cadeau', group: 'Événements & cadeaux', tags: 'bon achat avoir',
    art: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M2.5 10h19" />
        <path d="M6 14.5h4" />
      </>
    ),
  },

  /* ------------------------------------------- Maison & décoration */
  {
    key: 'vase', label: 'Vase', group: 'Maison & décoration',
    art: (
      <>
        <path d="M8.5 3h7l-.7 3.2a3 3 0 0 0 .5 2.4A6.5 6.5 0 0 1 12 21a6.5 6.5 0 0 1-3.3-12.4 3 3 0 0 0 .5-2.4Z" />
        <path d="M8.2 6.2h7.6" />
      </>
    ),
  },
  {
    key: 'pot', label: 'Cache-pot', group: 'Maison & décoration', tags: 'pot contenant',
    art: (
      <>
        <path d="M4.5 7h15l-1.7 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" />
        <path d="M3.5 7h17" />
      </>
    ),
  },
  {
    key: 'candle', label: 'Bougie', group: 'Maison & décoration', tags: 'cire parfum',
    art: (
      <>
        <rect x="8" y="9" width="8" height="12" rx="1.5" />
        <path d="M12 9V7" />
        <path d="M12 6.8c1.4-1 1.6-2.4.6-3.8-1.6 1-2 2.6-.6 3.8Z" />
      </>
    ),
  },
  {
    key: 'lamp', label: 'Luminaire', group: 'Maison & décoration', tags: 'lampe éclairage',
    art: (
      <>
        <path d="M5 11 8 4h8l3 7Z" />
        <path d="M12 11v6" />
        <path d="M9 20.5h6" />
        <path d="M12 17c-1.5 0-2.5 1.4-2.5 3.5h5C14.5 18.4 13.5 17 12 17Z" />
      </>
    ),
  },
  {
    key: 'frame', label: 'Cadre', group: 'Maison & décoration', tags: 'tableau affiche art',
    art: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M3.5 16 9 11l4.5 4L17 12l3.5 3.5" />
        <circle cx="15.5" cy="8" r="1.3" />
      </>
    ),
  },
  {
    key: 'cushion', label: 'Textile', group: 'Maison & décoration', tags: 'coussin plaid linge',
    art: (
      <>
        <path d="M4 6.5c5-1.5 11-1.5 16 0 1.2 3.7 1.2 7.3 0 11-5 1.5-11 1.5-16 0-1.2-3.7-1.2-7.3 0-11Z" />
        <path d="M7 8.5c3.3-.8 6.7-.8 10 0" />
      </>
    ),
  },
  {
    key: 'tableware', label: 'Art de la table', group: 'Maison & décoration', tags: 'vaisselle assiette',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
      </>
    ),
  },
  {
    key: 'clock', label: 'Horlogerie', group: 'Maison & décoration', tags: 'horloge pendule',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
  {
    key: 'basket', label: 'Panier', group: 'Maison & décoration', tags: 'osier corbeille',
    art: (
      <>
        <path d="M3 9h18l-1.8 9.2a2 2 0 0 1-2 1.6H6.8a2 2 0 0 1-2-1.6Z" />
        <path d="M8 9 10 4M16 9 14 4" />
        <path d="M4.5 13.5h15" />
      </>
    ),
  },

  /* ------------------------------------------------------ Alimentation */
  {
    key: 'fruit', label: 'Fruits', group: 'Alimentation', tags: 'pomme verger',
    art: (
      <>
        <path d="M12 7.5c-1-1-2.4-1.4-3.7-1C6 7.2 5 9.5 5.6 12.4 6.3 15.8 8.8 21 12 21s5.7-5.2 6.4-8.6c.6-2.9-.4-5.2-2.7-5.9-1.3-.4-2.7 0-3.7 1Z" />
        <path d="M12 7.5V5a2.5 2.5 0 0 1 2.5-2.5" />
      </>
    ),
  },
  {
    key: 'vegetable', label: 'Légumes', group: 'Alimentation', tags: 'carotte primeur',
    art: (
      <>
        {/* Carotte : corps effilé vers le bas, fanes en éventail, stries. */}
        <path d="M8.6 9.5h6.8l-2.6 10.8a.9.9 0 0 1-1.6 0Z" />
        <path d="M12 9.5V6.2" />
        <path d="M12 6.6c-2-.5-3.1-2.1-2.7-3.8 1.9.2 3 1.8 2.7 3.8Z" />
        <path d="M12 6.6c2-.5 3.1-2.1 2.7-3.8-1.9.2-3 1.8-2.7 3.8Z" />
        <path d="M9.8 13.2h4.4M10.4 16.4h3.2" />
      </>
    ),
  },
  {
    key: 'grapes', label: 'Raisin', group: 'Alimentation', tags: 'vigne',
    art: (
      <>
        <path d="M12 7V4.5" />
        <path d="M12 4.5c1.5 0 2.5-1 2.5-2.5" />
        <circle cx="9.5" cy="10" r="2.2" />
        <circle cx="14.5" cy="10" r="2.2" />
        <circle cx="12" cy="14" r="2.2" />
        <circle cx="7.5" cy="14.5" r="2.2" />
        <circle cx="16.5" cy="14.5" r="2.2" />
        <circle cx="12" cy="18.5" r="2.2" />
      </>
    ),
  },
  {
    key: 'cheese', label: 'Fromage', group: 'Alimentation', tags: 'crémerie',
    art: (
      <>
        <path d="M3 12 14 5.5 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" />
        <path d="M3 12h18" />
        <circle cx="8" cy="15.5" r="1.2" />
        <circle cx="15" cy="16" r="1.2" />
      </>
    ),
  },
  {
    key: 'meat', label: 'Boucherie', group: 'Alimentation', tags: 'viande charcuterie',
    art: (
      <>
        <path d="M6.5 17.5c-3-3-3-8 .5-11s8.5-2 11 1 1.5 7-1 9c-1.6 1.3-3 1-4 1.8-1 .8-2.6 1.5-4.5.6" />
        <circle cx="11" cy="10.5" r="2.6" />
      </>
    ),
  },
  {
    key: 'fish', label: 'Poissonnerie', group: 'Alimentation', tags: 'poisson marée',
    art: (
      <>
        <path d="M3 12c3-4 6.5-6 10-6s6.5 2 8 6c-1.5 4-4.5 6-8 6s-7-2-10-6Z" />
        <path d="M3 12c1.5-1.2 3-1.8 4.5-1.8" />
        <circle cx="16" cy="10.5" r="1" />
      </>
    ),
  },
  {
    key: 'honey', label: 'Épicerie fine', group: 'Alimentation', tags: 'miel confiture bocal',
    art: (
      <>
        <path d="M7 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" />
        <rect x="6" y="5.5" width="12" height="3.5" rx="1" />
        <path d="M9.5 13h5" />
      </>
    ),
  },
  {
    key: 'spice', label: 'Épices', group: 'Alimentation', tags: 'condiment aromates',
    art: (
      <>
        <path d="M8 8h8l-.8 11.2a2 2 0 0 1-2 1.8h-2.4a2 2 0 0 1-2-1.8Z" />
        <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
        <path d="M10.5 4.5h3" />
      </>
    ),
  },
  {
    key: 'basket-food', label: 'Panier garni', group: 'Alimentation', tags: 'coffret épicerie',
    art: (
      <>
        <path d="M3.5 10h17l-1.5 8.5a2 2 0 0 1-2 1.6H7a2 2 0 0 1-2-1.6Z" />
        <path d="M8 10 6 5.5M16 10l2-4.5" />
        <path d="M10 13.5v3.5M14 13.5v3.5" />
      </>
    ),
  },

  /* ------------------------------------ Boulangerie & pâtisserie */
  {
    key: 'bread', label: 'Pain', group: 'Boulangerie & pâtisserie', tags: 'boulangerie miche',
    art: (
      <>
        {/* Miche : dôme posé, grignes en diagonale. */}
        <path d="M3.5 13.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7c0 2.7-1.3 4.5-3.2 4.5H6.7c-1.9 0-3.2-1.8-3.2-4.5Z" />
        <path d="M9.3 9.6 7.8 13.4M12.6 9.2l-1.5 4.2M15.9 9.6l-1.5 3.8" />
      </>
    ),
  },
  {
    key: 'croissant', label: 'Viennoiserie', group: 'Boulangerie & pâtisserie', tags: 'croissant',
    art: (
      <>
        {/* Croissant : la lune couchée, avec ses deux pointes relevées. */}
        <path d="M17.6 5.2a8.6 8.6 0 1 0 0 13.6 6.9 6.9 0 0 1 0-13.6Z" />
        <path d="M17.6 5.2 20.8 4M17.6 18.8 20.8 20" />
      </>
    ),
  },
  {
    key: 'cake', label: 'Gâteau', group: 'Boulangerie & pâtisserie', tags: 'pâtisserie tarte',
    art: (
      <>
        <path d="M4 20.5v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6Z" />
        <path d="M4 16.5c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0 3.2-1.4 4.8 0" />
        <path d="M12 12.5V9" />
        <path d="M12 8.8c1-.7 1.2-1.8.4-2.8-1.2.7-1.5 1.9-.4 2.8Z" />
      </>
    ),
  },
  {
    key: 'cupcake', label: 'Petits gâteaux', group: 'Boulangerie & pâtisserie', tags: 'cupcake muffin',
    art: (
      <>
        <path d="M6.5 12h11l-1.3 7.3a2 2 0 0 1-2 1.7H9.8a2 2 0 0 1-2-1.7Z" />
        {/* Cannelures de la caissette : ce qui distingue le cupcake du gobelet. */}
        <path d="M9.4 12.4 8.9 20.8M12 12.4V21M14.6 12.4l.5 8.4" />
        {/* Glaçage en trois bosses franches, sinon la tuile se lit « seau ». */}
        <path d="M6.8 12a2.7 2.7 0 0 1 2-4.6A3.3 3.3 0 0 1 12 4.6a3.3 3.3 0 0 1 3.2 2.8 2.7 2.7 0 0 1 2 4.6" />
      </>
    ),
  },
  {
    key: 'cookie', label: 'Biscuits', group: 'Boulangerie & pâtisserie', tags: 'sablés cookie',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="9.5" cy="10" r="1" />
        <circle cx="14" cy="9.5" r="1" />
        <circle cx="12.5" cy="14.5" r="1" />
        <circle cx="8.5" cy="14.5" r="1" />
      </>
    ),
  },
  {
    key: 'chocolate', label: 'Chocolat', group: 'Boulangerie & pâtisserie', tags: 'confiserie tablette',
    art: (
      <>
        <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
        <path d="M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15" />
      </>
    ),
  },

  /* ------------------------------------------------------- Boissons */
  {
    key: 'wine', label: 'Vin', group: 'Boissons', tags: 'cave bouteille',
    art: (
      <>
        <path d="M7.5 3.5h9v6a4.5 4.5 0 0 1-9 0Z" />
        <path d="M7.6 9h8.8" />
        <path d="M12 14v6M9 20.5h6" />
      </>
    ),
  },
  {
    key: 'bottle', label: 'Bouteille', group: 'Boissons', tags: 'jus sirop huile',
    art: (
      <>
        <path d="M10 3h4v3.2c0 .8.3 1.5.9 2.1l.7.8c.6.7.9 1.5.9 2.4v7a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 7.5 18.5v-7c0-.9.3-1.7.9-2.4l.7-.8c.6-.6.9-1.3.9-2.1Z" />
        <path d="M7.5 13.5h9" />
      </>
    ),
  },
  {
    key: 'beer', label: 'Bière', group: 'Boissons', tags: 'brasserie',
    art: (
      <>
        <path d="M6 8h10v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" />
        <path d="M16 10.5h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" />
        <path d="M6 8c0-2.2 1.3-3.5 3-3.5.4-1 1.4-1.5 2.5-1.5s2.1.5 2.5 1.5c1.7 0 3 1.3 3 3.5" />
      </>
    ),
  },
  {
    key: 'coffee', label: 'Café', group: 'Boissons', tags: 'torréfaction expresso',
    art: (
      <>
        <path d="M4 9h13v6.5a4.5 4.5 0 0 1-9 0V9" />
        <path d="M4 9v6.5a4.5 4.5 0 0 0 4.5 4.5h4" />
        <path d="M17 10.5h1.8a2.2 2.2 0 0 1 0 4.4H17" />
        <path d="M8 6c0-1 1-1.4 1-2.5M12 6c0-1 1-1.4 1-2.5" />
      </>
    ),
  },
  {
    key: 'tea', label: 'Thé & infusion', group: 'Boissons', tags: 'tisane',
    art: (
      <>
        <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
        <path d="M16 10h1.8a2.2 2.2 0 0 1 0 4.4H16" />
        <path d="M4 21.5h13" />
        <path d="M10.5 5.5c1.5-1 1.7-2.2.7-3.5" />
      </>
    ),
  },
  {
    key: 'cocktail', label: 'Cocktail', group: 'Boissons', tags: 'apéritif spiritueux',
    art: (
      <>
        <path d="M4 5h16l-8 8Z" />
        <path d="M12 13v7.5M8.5 20.5h7" />
        <circle cx="17" cy="8.5" r="1.2" />
      </>
    ),
  },

  /* --------------------------------------------------- Beauté & soin */
  {
    key: 'perfume', label: 'Parfum', group: 'Beauté & soin',
    art: (
      <>
        <rect x="7" y="8.5" width="10" height="12.5" rx="2" />
        <path d="M10 8.5V6h4v2.5" />
        <path d="M14 4.5h2.5v2" />
        <path d="M10 13h4" />
      </>
    ),
  },
  {
    key: 'cosmetics', label: 'Cosmétique', group: 'Beauté & soin', tags: 'crème soin pot',
    art: (
      <>
        <path d="M5.5 10h13v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2Z" />
        <rect x="7" y="6" width="10" height="4" rx="1.5" />
        <path d="M10 3.5h4" />
      </>
    ),
  },
  {
    key: 'soap', label: 'Savonnerie', group: 'Beauté & soin', tags: 'savon hygiène',
    art: (
      <>
        <rect x="3.5" y="11" width="17" height="9" rx="2.5" />
        <path d="M8 11V8.5a2 2 0 0 1 2-2h1" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="18.6" cy="8.6" r="1.1" />
      </>
    ),
  },
  {
    key: 'lipstick', label: 'Maquillage', group: 'Beauté & soin', tags: 'rouge à lèvres',
    art: (
      <>
        <path d="M9 10h6v11H9Z" />
        <path d="M9.5 10V5.5A2.5 2.5 0 0 1 12 3l2.5 2v5" />
        <path d="M8 15.5h8" />
      </>
    ),
  },
  {
    key: 'hair', label: 'Coiffure', group: 'Beauté & soin', tags: 'ciseaux salon',
    art: (
      <>
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="6" cy="6" r="2.5" />
        <path d="M8 16.5 19 4.5M8 7.5l11 12" />
      </>
    ),
  },
  {
    key: 'nails', label: 'Ongles', group: 'Beauté & soin', tags: 'vernis manucure',
    art: (
      <>
        <path d="M8 10h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z" />
        <path d="M10 10V7h4v3" />
        <path d="M11 4.5h2V7h-2Z" />
      </>
    ),
  },
  {
    key: 'wellness', label: 'Bien-être', group: 'Beauté & soin', tags: 'spa massage détente',
    art: (
      <>
        <path d="M12 21c0-5 3-9 8-10-1 5.5-4 9-8 10Z" />
        <path d="M12 21c0-5-3-9-8-10 1 5.5 4 9 8 10Z" />
        <path d="M12 21v-6" />
      </>
    ),
  },

  /* ---------------------------------------------- Mode & accessoires */
  {
    key: 'clothing', label: 'Vêtements', group: 'Mode & accessoires', tags: 'tshirt prêt-à-porter',
    art: (
      <path d="M8.5 3.5 5 5.5 3.5 9.5l3 1.2V20.5h11V10.7l3-1.2L19 5.5l-3.5-2a3.5 3.5 0 0 1-7 0Z" />
    ),
  },
  {
    key: 'dress', label: 'Robe', group: 'Mode & accessoires',
    art: (
      <>
        {/* Ligne A : buste étroit, jupe franchement évasée jusqu'aux bords. */}
        <path d="M8.8 3.5h6.4l-1.1 4.3 4.4 11.1a1.2 1.2 0 0 1-1.1 1.6H6.6a1.2 1.2 0 0 1-1.1-1.6l4.4-11.1Z" />
        <path d="M9.9 7.8h4.2" />
      </>
    ),
  },
  {
    key: 'shoe', label: 'Chaussures', group: 'Mode & accessoires',
    art: (
      <>
        <path d="M3 17.5v-6h3l2.5 2.5H13c4 0 8 1 8 3.5v.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z" />
        <path d="M6 11.5v3M9.5 14v2.5" />
      </>
    ),
  },
  {
    key: 'bag', label: 'Maroquinerie', group: 'Mode & accessoires', tags: 'sac cuir',
    art: (
      <>
        <path d="M4.5 8h15l-1.2 11.2a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8Z" />
        <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
      </>
    ),
  },
  {
    key: 'hat', label: 'Chapellerie', group: 'Mode & accessoires', tags: 'chapeau',
    art: (
      <>
        <path d="M7 14V8a5 5 0 0 1 10 0v6" />
        <path d="M3 14.5c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5c0-1.2-1.6-2.2-4-2.8" />
        <path d="M7 11.7c-2.4.6-4 1.6-4 2.8" />
      </>
    ),
  },
  {
    key: 'jewelry', label: 'Bijoux', group: 'Mode & accessoires', tags: 'joaillerie bague',
    art: (
      <>
        <path d="M8 3.5h8l3.5 5-7.5 12-7.5-12Z" />
        <path d="M4.5 8.5h15" />
        <path d="M8 3.5 12 8.5 16 3.5M12 8.5v12" />
      </>
    ),
  },
  {
    key: 'watch', label: 'Montres', group: 'Mode & accessoires',
    art: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 9.5V12l1.8 1.2" />
        <path d="M9 7.3 9.5 3h5l.5 4.3M9 16.7l.5 4.3h5l.5-4.3" />
      </>
    ),
  },
  {
    key: 'glasses', label: 'Lunettes', group: 'Mode & accessoires', tags: 'optique solaire',
    art: (
      <>
        <circle cx="6" cy="14" r="3.5" />
        <circle cx="18" cy="14" r="3.5" />
        <path d="M9.5 13.5c1.5-1 3.5-1 5 0" />
        <path d="M2.5 12 4 8h3M21.5 12 20 8h-3" />
      </>
    ),
  },

  /* -------------------------------------------------------- Animaux */
  {
    key: 'paw', label: 'Animalerie', group: 'Animaux', tags: 'patte chien chat',
    art: (
      <>
        <ellipse cx="7" cy="10" rx="1.9" ry="2.4" />
        <ellipse cx="11" cy="7.5" rx="1.9" ry="2.4" />
        <ellipse cx="15.5" cy="8.5" rx="1.9" ry="2.4" />
        <ellipse cx="18.5" cy="12.5" rx="1.8" ry="2.2" />
        <path d="M12.5 12.5c3 0 5 2 5 4.5s-2.5 4-5 4-5-1.5-5-4 2-4.5 5-4.5Z" />
      </>
    ),
  },
  {
    key: 'dog', label: 'Chien', group: 'Animaux',
    art: (
      <>
        <path d="M6 6.5 4.5 12v5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5L18 6.5l-3 2.5H9Z" />
        <circle cx="9.5" cy="13.5" r="1" />
        <circle cx="14.5" cy="13.5" r="1" />
        <path d="M12 15.5v1.5" />
      </>
    ),
  },
  {
    key: 'cat', label: 'Chat', group: 'Animaux',
    art: (
      <>
        <path d="M5 8 6.5 3.5 10 6.5h4l3.5-3L19 8v6a7 7 0 0 1-14 0Z" />
        <circle cx="9.5" cy="12" r="1" />
        <circle cx="14.5" cy="12" r="1" />
        <path d="M10.5 15.5h3" />
      </>
    ),
  },
  {
    key: 'bird', label: 'Oiseaux', group: 'Animaux',
    art: (
      <>
        <path d="M16 5.5a2.5 2.5 0 1 0-4.6 1.4C9 8 7 10.6 7 14a5.5 5.5 0 0 0 5.5 5.5c3.3 0 5.5-2.4 5.5-6V8" />
        <path d="M18 7.5 21.5 6 18 4.5" />
        <path d="M7.5 16.5 4 20" />
      </>
    ),
  },
  {
    key: 'aquarium', label: 'Aquariophilie', group: 'Animaux', tags: 'poisson aquarium',
    art: (
      <>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M7 13.5c1.5-2 4-2 5.5 0-1.5 2-4 2-5.5 0Z" />
        <path d="M12.5 13.5 15 11.5v4Z" />
        <path d="M17 9.5v.01" />
      </>
    ),
  },

  /* -------------------------------------------- Loisirs & culture */
  {
    key: 'book', label: 'Librairie', group: 'Loisirs & culture', tags: 'livre papeterie',
    art: (
      <>
        <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v12a2 2 0 0 0-2-2H4Z" />
        <path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v12a2 2 0 0 1 2-2h6Z" />
      </>
    ),
  },
  {
    key: 'music', label: 'Musique', group: 'Loisirs & culture', tags: 'disque instrument',
    art: (
      <>
        <path d="M9 18V5.5l10-2V16" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </>
    ),
  },
  {
    key: 'art', label: 'Loisirs créatifs', group: 'Loisirs & culture', tags: 'peinture palette art',
    art: (
      <>
        <path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8s3.8 8 8.5 8c1.4 0 2-.8 2-1.7 0-1.3-1.2-1.5-1.2-2.6 0-.9.8-1.6 1.8-1.6h1.6c2.6 0 4.3-1.8 4.3-4.3 0-3.3-3.6-5.8-8.5-5.8Z" />
        <circle cx="8" cy="9.5" r="1.1" />
        <circle cx="12" cy="7.5" r="1.1" />
        <circle cx="16" cy="9.5" r="1.1" />
      </>
    ),
  },
  {
    key: 'game', label: 'Jeux & jouets', group: 'Loisirs & culture', tags: 'jouet enfant',
    art: (
      <>
        <rect x="3.5" y="7.5" width="17" height="11" rx="4" />
        <path d="M8 11v4M6 13h4" />
        <circle cx="15.5" cy="12" r="1" />
        <circle cx="17.5" cy="14.5" r="1" />
      </>
    ),
  },
  {
    key: 'photo', label: 'Photo', group: 'Loisirs & culture', tags: 'appareil image',
    art: (
      <>
        <rect x="2.5" y="6.5" width="19" height="13" rx="2.5" />
        <circle cx="12" cy="13" r="3.8" />
        <path d="M8 6.5 9.5 4h5l1.5 2.5" />
      </>
    ),
  },
  {
    key: 'sport', label: 'Sport', group: 'Loisirs & culture',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5c-2.5 2.4-2.5 14.6 0 17M12 3.5c2.5 2.4 2.5 14.6 0 17" />
        <path d="M3.7 9.5c4.5 1.6 12.1 1.6 16.6 0M3.7 14.5c4.5-1.6 12.1-1.6 16.6 0" />
      </>
    ),
  },
  {
    key: 'bike', label: 'Cycles', group: 'Loisirs & culture', tags: 'vélo',
    art: (
      <>
        <circle cx="5.5" cy="16.5" r="3.5" />
        <circle cx="18.5" cy="16.5" r="3.5" />
        <path d="M5.5 16.5 10 8h5l3.5 8.5" />
        <path d="M8 16.5h7L11.5 8" />
        <path d="M14 5.5h2.5" />
      </>
    ),
  },

  /* ------------------------------------------- Services & atelier */
  {
    key: 'delivery', label: 'Livraison', group: 'Services & atelier', tags: 'camion transport',
    art: (
      <>
        <path d="M2.5 6.5h11v9h-11Z" />
        <path d="M13.5 10h3.6l2.9 3v2.5h-6.5Z" />
        <circle cx="7" cy="17.5" r="2" />
        <circle cx="17" cy="17.5" r="2" />
      </>
    ),
  },
  {
    key: 'workshop', label: 'Atelier', group: 'Services & atelier', tags: 'cours formation',
    art: (
      <>
        <path d="M11 3.5 3 8l8 4.5L19 8Z" />
        <path d="M6 10v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5" />
        <path d="M19 8v6" />
      </>
    ),
  },
  {
    key: 'subscription', label: 'Abonnement', group: 'Services & atelier', tags: 'récurrent formule',
    art: (
      <>
        <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9l2.4 2.3" />
        <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.6" />
        <path d="M20.5 3.5v4.9h-4.9M3.5 20.5v-4.9h4.9" />
      </>
    ),
  },
  {
    key: 'repair', label: 'Réparation', group: 'Services & atelier', tags: 'entretien SAV outil',
    art: (
      <>
        <path d="M15.5 3.5a5 5 0 0 0-4.4 7.4L3.5 18.5l2 2 7.6-7.6a5 5 0 0 0 6.4-6.6l-2.8 2.8-2.4-2.4Z" />
      </>
    ),
  },
  {
    key: 'appointment', label: 'Rendez-vous', group: 'Services & atelier', tags: 'agenda calendrier',
    art: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
        <path d="M8 13.5h3M8 17h6" />
      </>
    ),
  },
  {
    key: 'funeral', label: 'Deuil', group: 'Services & atelier', tags: 'obsèques condoléances',
    art: (
      <>
        <path d="M12 21V6" />
        <path d="M7 10.5h10" />
        <path d="M12 6c-1.7 0-3-1.1-3-2.5S10.3 1.5 12 1.5s3 .6 3 2S13.7 6 12 6Z" />
        <path d="M6 21h12" />
      </>
    ),
  },

  /* -------------------------------------------------------- Commerce */
  {
    key: 'tag', label: 'Étiquette', group: 'Commerce', tags: 'prix promo',
    art: (
      <>
        <path d="M11.6 3.5H20v8.4l-8.9 8.9a1.5 1.5 0 0 1-2.1 0l-6.3-6.3a1.5 1.5 0 0 1 0-2.1Z" />
        <circle cx="16.2" cy="7.8" r="1.6" />
      </>
    ),
  },
  {
    key: 'sale', label: 'Promotions', group: 'Commerce', tags: 'soldes remise pourcentage',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 15.5 15.5 8.5" />
        <circle cx="9.3" cy="9.3" r="1.3" />
        <circle cx="14.7" cy="14.7" r="1.3" />
      </>
    ),
  },
  {
    key: 'star', label: 'Nouveautés', group: 'Commerce', tags: 'coup de cœur vedette',
    art: (
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8Z" />
    ),
  },
  {
    key: 'box', label: 'Colis', group: 'Commerce', tags: 'carton expédition stock',
    art: (
      <>
        <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z" />
        <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
      </>
    ),
  },
  {
    key: 'euro', label: 'Divers payant', group: 'Commerce', tags: 'prix euro monnaie',
    art: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M15.5 8.5a4.5 4.5 0 0 0-6.5 4 4.5 4.5 0 0 0 6.5 4" />
        <path d="M7.5 11h5.5M7.5 13.5h5.5" />
      </>
    ),
  },
  {
    key: 'cart', label: 'Divers', group: 'Commerce', tags: 'panier achats',
    art: (
      <>
        <path d="M2.5 4h2.2l2.4 10.5h10L20 7H6" />
        <circle cx="9" cy="19" r="1.6" />
        <circle cx="16.5" cy="19" r="1.6" />
      </>
    ),
  },

  /* --------------------------------------------------------- Repères */
  {
    key: 'dots', label: 'Autres', group: 'Repères', tags: 'sans catégorie divers',
    art: (
      <>
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
      </>
    ),
  },
  {
    key: 'grid', label: 'Rayon', group: 'Repères', tags: 'grille sections',
    art: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    key: 'bookmark', label: 'Sélection', group: 'Repères', tags: 'marque-page favoris',
    art: (
      <path d="M6.5 3.5h11v17l-5.5-4-5.5 4Z" />
    ),
  },
  {
    key: 'sparkle', label: 'Éphémère', group: 'Repères', tags: 'saison nouveauté étincelle',
    art: (
      <>
        <path d="M12 3.5 13.8 9l5.7 1.8L13.8 12.6 12 18.5l-1.8-5.9L4.5 10.8 10.2 9Z" />
        <path d="M18.5 3v3M20 4.5h-3" />
      </>
    ),
  },
  {
    key: 'flag', label: 'Temps forts', group: 'Repères', tags: 'drapeau événement saison',
    art: (
      <>
        <path d="M6 21V4" />
        <path d="M6 4.5h11l-2 4 2 4H6" />
      </>
    ),
  },
  {
    key: 'circle', label: 'Neutre', group: 'Repères', tags: 'rond simple',
    art: <circle cx="12" cy="12" r="8" />,
  },
];

const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i]));

export function categoryIconDef(key: string | null | undefined): CategoryIconDef | null {
  return key ? BY_KEY.get(key) ?? null : null;
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
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" focusable="false"
    >
      {def.art}
    </svg>
  );
}
