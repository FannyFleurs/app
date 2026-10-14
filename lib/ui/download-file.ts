/**
 * Télécharge un fichier généré par le serveur (PDF…) en le récupérant
 * depuis l'intérieur de la page (fetch, donc avec la session de l'onglet
 * courant), puis déclenche un enregistrement local via un lien `<a
 * download>` — jamais une navigation vers l'URL elle-même.
 *
 * Nécessaire dans l'app native (Capacitor) : un lien classique
 * `target="_blank"` vers une route authentifiée y bascule systématiquement
 * vers Safari, qui n'a pas la session de la WebView embarquée — la réponse y
 * arrive donc en erreur (401) au lieu du PDF. Un fetch + téléchargement local
 * reste dans le contexte authentifié et n'échappe jamais vers un navigateur
 * externe. Vaut aussi en dehors de l'app native : même mécanisme, zéro risque
 * en plus.
 */
export async function downloadFile(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}
