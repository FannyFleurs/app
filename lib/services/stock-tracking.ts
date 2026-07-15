/**
 * Règle « produit suivi en stock ».
 *
 * Un mouvement de stock (vente / retour / etc.) n'est tracé QUE pour un produit
 * physique revendable, c'est-à-dire :
 *   - qui possède un code-barres (EAN) renseigné, ET
 *   - qui n'appartient pas à la catégorie « Livraison » (services de livraison).
 *
 * Les cartes cadeaux (vendues comme moyen de paiement, sans code-barres) et les
 * services n'ayant pas d'EAN sont donc exclus de fait.
 *
 * `STOCK_TRACKED_SQL` est un fragment SQL réutilisable côté serveur et dans le
 * script de rattrapage. Il suppose les alias de table :
 *   p = products
 *   c = product_categories (via LEFT JOIN c ON c.id = p.category_id)
 */
export const STOCK_TRACKED_SQL = `(
  p.barcode IS NOT NULL AND btrim(p.barcode) <> ''
  AND COALESCE(lower(btrim(c.name)), '') <> 'livraison'
)`;
