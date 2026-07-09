/**
 * Référence courte et stable d'un poste (caisse liée à un appareil).
 * Dérivée de l'UUID de la caisse : identique côté admin (liste des
 * postes actifs) et côté caisse (affichée en bas à droite), pour que
 * l'opérateur puisse communiquer sa référence au support.
 */
export function posteRef(registerId: string): string {
  const hex = registerId.replace(/[^a-f0-9]/gi, '').toUpperCase();
  return `HP-${hex.slice(0, 6)}`;
}
