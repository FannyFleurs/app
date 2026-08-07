/**
 * Entrée de menu correspondant au chemin courant.
 *
 * Un menu qui teste chaque entrée isolément (`path.startsWith(href + '/')`)
 * allume TOUTES les entrées parentes : sur /settings/users, « Utilisateurs »
 * et « Paramètres » s'éclairaient ensemble, et l'on ne savait plus où l'on
 * se trouvait. La sélection ne peut donc pas se décider entrée par entrée :
 * elle se décide sur l'ensemble du menu, en retenant la correspondance la
 * plus profonde — celle que l'on vient réellement d'ouvrir.
 *
 * Le repli sur le parent reste assuré : sur /stock/transfer, si l'entrée
 * « Transfert stock » n'est pas affichée (permission, onglets masqués),
 * c'est « Stock » qui s'allume, faute de plus précis dans la liste passée.
 */
export function activeNavHref(
  path: string | null | undefined,
  hrefs: readonly string[],
): string | null {
  if (!path) return null;
  // Un chemin peut arriver avec une barre finale ; sans normalisation,
  // « /settings/ » ne correspondrait plus à « /settings ».
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  let best: string | null = null;
  for (const href of hrefs) {
    const prefix = href.endsWith('/') ? href : href + '/';
    if (p !== href && !p.startsWith(prefix)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
