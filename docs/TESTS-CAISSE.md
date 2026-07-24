# ✅ Recette caisse HelloPos — Test de A à Z

> Coche `[x]` chaque étape validée. Note tout comportement anormal dans « Anomalies » en bas.
> Objectif : mettre la caisse en service **sans erreur**.
> Légende : 🟢 = à faire une fois (configuration) · 🔵 = à tester à chaque utilisation type · ⚙️ = back-office (bo.) · 🧾 = caisse.

---

## 0. Prérequis / environnement

- [ ] La caisse s'ouvre sur `app.` (ou le domaine caisse) sans erreur.
- [ ] Le **logo** et le **nom** de la boutique s'affichent correctement.
- [ ] Bandeau « En ligne » présent (connexion OK).
- [ ] Aucune erreur affichée au chargement (écran blanc, message rouge…).

---

## 1. ⚙️ Configuration back-office (à faire avant d'ouvrir la caisse)

### 1.1 Société & boutiques
- [ ] La/les **boutique(s)** existent avec leur nom.
- [ ] Chaque boutique a au moins **une caisse** (registre) active.
- [ ] Les **taux de TVA** sont créés (ex. 20 %, 10 %, 5,5 %) avec un taux par défaut.

### 1.2 Modes de règlement
- [ ] Espèces, Carte présents et actifs.
- [ ] Autres modes voulus activés (chèque, virement, lien de paiement, en compte, avoir, carte cadeau).
- [ ] (Si carte via TPE/Stripe) configuration renseignée.

### 1.3 Catalogue
- [ ] Au moins **quelques catégories** créées et **visibles sur la caisse**.
- [ ] Au moins **quelques articles** créés, avec **prix TTC** et **TVA**.
- [ ] Les articles sont **rattachés à la bonne boutique** (pas « toutes boutiques » par erreur).
- [ ] (Optionnel) Un article **Top** apparaît en 1ʳᵉ ligne.
- [ ] (Optionnel) Un article avec **code-barres** pour tester le scan.
- [ ] (Optionnel) Un article avec **remise** (permanente) pour vérifier l'affichage.

### 1.4 Utilisateurs & droits
- [ ] Au moins un utilisateur **vendeur** avec code PIN.
- [ ] Un utilisateur **responsable/owner** (remises, annulations).
- [ ] Les utilisateurs sont **rattachés à la bonne boutique**.

### 1.5 Réglages divers
- [ ] **Fond de caisse** paramétré.
- [ ] **Paramétrage ticket** (en-tête, pied de page, mentions).
- [ ] **Fidélité** configurée (si utilisée).
- [ ] (Optionnel) **Écran & livraison** / commande différée activée si besoin.

---

## 2. 🧾 Connexion & poste

- [ ] L'écran de connexion affiche **les utilisateurs de la bonne boutique**.
- [ ] Connexion par **code PIN** OK.
- [ ] (1er lancement) Sélection de la **caisse/poste** demandée, puis mémorisée.
- [ ] Après connexion, on arrive sur la **caisse** sans erreur.
- [ ] Le poste affiche la **bonne boutique** et **ses articles uniquement**.
- [ ] Déconnexion / reconnexion OK.

---

## 3. 🧾 Ouverture de journée / fond de caisse

- [ ] À la 1ʳᵉ vente du jour, la **journée s'ouvre** automatiquement (ou via le bouton).
- [ ] Le **fond de caisse** initial est demandé / pris en compte.
- [ ] Aucune erreur à l'ouverture.

---

## 4. 🧾 Navigation catalogue

- [ ] Les **catégories** s'affichent (tuiles) avec image/couleur.
- [ ] Cliquer une catégorie affiche **ses articles**.
- [ ] Le bouton **retour** revient aux catégories.
- [ ] Les articles **Top** apparaissent en premier.
- [ ] Une catégorie **décochée « visible caisse »** en BO **n'apparaît pas**.
- [ ] Taille des tuiles conforme au réglage (Mini/Dense/Compact…).

---

## 5. 🧾 Recherche & scan

- [ ] La **barre de recherche** est visible et cliquable (pas juste une loupe).
- [ ] Rechercher par **nom** filtre les articles.
- [ ] Rechercher par **code-barres** (Entrée) ajoute l'article au panier.
- [ ] (Mobile/tablette) le **scanner caméra** ouvre et lit un code.
- [ ] Un **code inconnu** ne casse rien (message clair).
- [ ] Scan d'une **carte fidélité** (FID…) rattache le bon client.

---

## 6. 🧾 Panier / ticket

- [ ] Ajouter un article → il apparaît dans le ticket (bon prix TTC).
- [ ] Ajouter **plusieurs fois** le même → la **quantité** s'incrémente.
- [ ] Modifier la **quantité** (＋ / −) fonctionne.
- [ ] Le **total** (TTC, dont TVA) se met à jour correctement.
- [ ] La croix **✕ supprime la ligne** SANS demander de justification (vente non validée).
- [ ] Bouton **Actions** : remise globale / commentaire OK.
- [ ] Une **remise ligne** (si activée) s'applique et s'affiche.
- [ ] Le **commentaire** de ticket se voit (icône) et s'imprime.
- [ ] Bouton **Vider** : demande **confirmation (modale au thème)**, puis vide.
- [ ] Bouton **Annuler** : bien **séparé, style rouge**, demande **confirmation**, abandonne la vente.
- [ ] Toutes les modales sont **au thème** (pas de popup gris du navigateur).

---

## 7. 🧾 Client

- [ ] **Rechercher un client** existant et le rattacher au ticket.
- [ ] **Créer** un client à la volée.
- [ ] Cliquer le **chip client** ouvre sa fiche **sans perdre le panier**.
- [ ] **Fidélité** : le solde de points s'affiche ; utilisation d'une remise fidélité OK.
- [ ] **Carte cadeau** : recherche par n° / nom ; solde affiché dans le ticket.
- [ ] **En compte** (paiement différé) : le solde client se met à jour.

---

## 8. 🧾 Boutons de règlement (ergonomie)

- [ ] **Espèces / Autres / Carte** forment un groupe **aligné**, sans chevauchement.
- [ ] Hauteurs cohérentes, utilisables **au doigt** (≥ 48 px).
- [ ] **Carte** est le bouton principal mis en avant.

---

## 9. 🧾 Encaissement — chaque mode

> Refaire une petite vente pour chaque test.

- [ ] **Espèces** (bouton rapide) : vente validée, ticket généré.
- [ ] Espèces avec **montant donné → rendu monnaie** correct.
- [ ] **Carte** (bouton rapide) : vente validée.
- [ ] **Autres → Chèque** : validé (référence si demandée).
- [ ] **Autres → Virement** : validé.
- [ ] **Autres → Paiement multiple** (ex. espèces + carte) : totaux corrects, validé.
- [ ] **Autres → Lien de paiement Stripe** : lien créé + notification de paiement en temps réel.
- [ ] **Avoir** (bon d'achat) : utilisé en paiement, solde décompté.
- [ ] **Carte cadeau** : utilisée en paiement.
- [ ] **En compte** (différé) : validé, solde client augmenté.
- [ ] Une vente à **0 €** est refusée / gérée proprement.

---

## 10. 🧾 Ticket / reçu

- [ ] Le **ticket s'affiche** après validation (aperçu).
- [ ] L'aperçu **ne se ferme pas tout seul**.
- [ ] **Imprimer** le ticket (imprimante configurée) OK.
- [ ] **Envoyer par email** : si pas d'email client → **modale de saisie** d'adresse.
- [ ] (Si Brevo configuré) l'email est bien **reçu** avec le ticket en PJ.
- [ ] Le **numéro de ticket** + **code-barres** figurent sur le reçu.
- [ ] **Auto-déconnexion après-vente** (si activée) se déclenche à la fermeture du ticket.

---

## 11. 🧾 Facture

- [ ] Générer une **facture** depuis une vente : PDF correct (dates lisibles, pas de chevauchement).
- [ ] Facture **envoyée par email** (manuel) OK.
- [ ] (Si activé) **auto-envoi** de la facture à la génération.
- [ ] Mentions société / SIRET / TVA correctes sur le PDF.

---

## 12. 🧾 Paniers en attente

- [ ] Mettre un ticket **En attente** (le compteur s'incrémente).
- [ ] Démarrer une **nouvelle vente** pendant ce temps.
- [ ] **Reprendre** le panier en attente (lignes + client restaurés).
- [ ] Le panier en cours est **restauré** au retour sur la caisse (rechargement).

---

## 13. 🧾 Commande différée (si activée)

- [ ] Créer une **commande** (acompte, date de retrait) : enregistrée.
- [ ] La commande apparaît dans **Commandes** avec le **bon statut de paiement** (pas « Impayée » à tort).
- [ ] Solder / retirer la commande.
- [ ] (Si lien de paiement) statut mis à jour au paiement.

---

## 14. 🧾 Annulation / avoir / remboursement

- [ ] **Annuler une vente validée** (avoir/reversal complet) : mouvement correct.
- [ ] Un **avoir** est généré et réutilisable.
- [ ] La numérotation (facture F… / avoir A…) est **continue et cohérente**.
- [ ] Impossible de modifier une vente **déjà validée** (protection fiscale).

---

## 15. 🧾 Gestion argent / caisse

- [ ] **Mouvement d'espèces** (entrée/sortie) enregistré.
- [ ] **Remise en banque** : montant déduit, reçu imprimable.
- [ ] La remise en banque apparaît dans **Ma journée** et sur le **Z**.

---

## 16. 🧾 Ma journée (X) & Clôture (Z)

- [ ] **Ma journée** : CA, ticket moyen, marge, TVA, par vendeur / catégorie / mode — cohérents.
- [ ] **X complet** affiche le même contenu que le **Z**.
- [ ] **Comptage espèces** persistant (ressaisie non perdue).
- [ ] **Montant à compter** affiché (déduction remise en banque).
- [ ] **Clôture Z** : PDF conforme au modèle, hash/chaîne fiscale présents.
- [ ] Après clôture, la journée est **verrouillée**.

---

## 17. 🧾 Stock (si suivi activé)

- [ ] La vente **décrémente le stock** de l'article.
- [ ] **Mouvement de stock** manuel (entrée/sortie) OK.
- [ ] **Transfert** entre boutiques (si multi) OK.
- [ ] **Inventaire** : saisie → pointage → validation (mouvements enregistrés).

---

## 18. 🧾 Multi-boutiques (si applicable)

- [ ] La caisse **Plante Verte** ne montre **que ses articles/catégories**.
- [ ] La caisse **Fanny Fleurs** idem.
- [ ] Aucun article « fuite » d'une boutique à l'autre.
- [ ] Le back-office voit **tout** ; la caisse voit **sa boutique**.

---

## 19. 🖨️ Étiquettes / PDA (optionnel)

- [ ] Imprimer une étiquette produit (aperçu correct : nom, prix, code-barres).
- [ ] (PDA) `pda.` : appairage par **code** ou **QR** OK.
- [ ] (PDA) scan → choix **Étiquette / Stock**.
- [ ] (PDA) entrée de stock + bouton **« Imprimer N étiquettes »**.
- [ ] (PDA) création d'article (pleine page) + photo.

---

## 20. ♿ Accessibilité / ergonomie

- [ ] Cibles tactiles du header (Actions/En attente/Vider/Annuler) **≥ 44 px**.
- [ ] Barre latérale gauche : **libellés visibles** (Caisse, Clients, Stock…), élément **actif marqué**.
- [ ] Textes lisibles (pas de vert clair illisible, texte muté suffisamment foncé).
- [ ] Fond des pages en **blanc cassé**, cartes en blanc (contraste OK).

---

## 21. 📶 Hors-ligne / PWA (si utilisé)

- [ ] Ajout à l'écran d'accueil : l'icône ouvre **la caisse** (pas une autre app).
- [ ] Coupure réseau brève : bandeau **hors-ligne**, la caisse reste utilisable.
- [ ] Retour en ligne : synchronisation OK, aucune vente perdue.

---

## 22. 🔁 Scénario complet « vraie journée » (bout en bout)

- [ ] Ouvrir la caisse → fond de caisse.
- [ ] 1 vente **espèces** avec rendu monnaie.
- [ ] 1 vente **carte** avec **client + fidélité**.
- [ ] 1 vente **paiement multiple**.
- [ ] 1 **panier en attente** puis repris.
- [ ] 1 **annulation** / avoir.
- [ ] 1 **remise en banque**.
- [ ] **X** en cours de journée.
- [ ] **Clôture Z** en fin de journée.
- [ ] Vérifier que **Ma journée** = **Z** = réalité.

---

## 🐞 Anomalies rencontrées

| # | Écran / action | Ce qui s'est passé | Attendu | Gravité |
|---|----------------|--------------------|---------|---------|
| 1 |                |                    |         |         |
| 2 |                |                    |         |         |
| 3 |                |                    |         |         |
| 4 |                |                    |         |         |
| 5 |                |                    |         |         |

---

**Bilan** : ____ / ____ étapes OK — Prêt pour la mise en service : ☐ Oui ☐ Non
