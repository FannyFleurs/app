/**
 * Les photos prises depuis le PDA sont enregistrées en data URL (base64)
 * directement dans products.image_url (voir /api/products/[id]/photo,
 * PATCH). Les renvoyer telles quelles dans la liste catalogue caisse —
 * relue automatiquement toutes les 15 s par CHAQUE poste de caisse, dès
 * qu'un seul produit change n'importe où dans l'organisation (voir
 * /api/products/catalog-version) — multiplie leur poids par le nombre de
 * postes ouverts et de rafraîchissements. Une poignée de photos prises en
 * rafale via PDA suffit à déclencher un pic de transfert réseau énorme.
 *
 * On remplace la data URL par une référence légère vers une route dédiée,
 * mise en cache par le navigateur (Cache-Control immuable, versionnée par
 * `updated_at`) : chaque photo n'est alors transférée qu'une fois par
 * appareil, plus à chaque poll du catalogue.
 *
 * Ne s'applique QU'à la liste consommée par la caisse (pos=1) : le
 * back-office (édition, duplication d'article) a besoin de la donnée brute
 * — la duplication recopie `image_url` tel quel sur le nouvel article.
 */
export function photoRefForPos(id: string, imageUrl: string | null, updatedAt: string | null): string | null {
  if (!imageUrl || !imageUrl.startsWith('data:')) return imageUrl;
  return `/api/products/${id}/photo?v=${encodeURIComponent(updatedAt ?? '0')}`;
}
