# HelloPos - Réponses « App Privacy » (App Store Connect)

Réponses au questionnaire de confidentialité d'App Store Connect, fondées sur
l'architecture réelle. À reporter dans App Store Connect → votre app →
**Confidentialité de l'app**.

Contexte : HelloPos est un logiciel de caisse (B2B). L'app est une coque native
autour du service hébergé `app.hellopos.fr`. Les données sont envoyées au
serveur HelloPos (donc « collectées » au sens Apple) et **liées au compte**.
**Aucune donnée n'est utilisée pour le suivi (tracking)** : pas de SDK
publicitaire, d'analytics tiers ni de courtier de données. Pas d'invite ATT.

Règle générale pour tout ce qui est collecté ci-dessous :
**Lié à l'utilisateur = Oui · Utilisé pour le suivi = Non · Finalité =
Fonctionnement de l'app** (et « Assistance » quand précisé).

---

## 1) Données COLLECTÉES

### Coordonnées (Contact Info)
- **Nom** — utilisateurs du logiciel + clients du commerce.
- **Adresse e-mail** — comptes, clients, envoi de tickets/factures.
- **Numéro de téléphone** — clients, contact.
- **Adresse postale** — adresse des clients, adresse de l'établissement.
- Lié : Oui · Suivi : Non · Finalités : Fonctionnement de l'app, Assistance.

### Achats (Purchases)
- **Historique des achats** — ventes, tickets, transactions enregistrés en caisse.
- Lié : Oui · Suivi : Non · Finalité : Fonctionnement de l'app.

### Informations financières (Financial Info)
- **Autres informations financières** — montants des ventes/règlements,
  coordonnées bancaires (RIB) de l'établissement saisies pour ses factures.
- **Les numéros de carte bancaire NE SONT PAS collectés** : les paiements par
  carte se font sur le terminal du commerçant ou via le prestataire de paiement
  (Stripe) ; HelloPos ne conserve que le **mode** et le **montant**.
- Lié : Oui · Suivi : Non · Finalité : Fonctionnement de l'app.

### Identifiants (Identifiers)
- **ID utilisateur** — identifiant de compte/utilisateur.
- **ID appareil** — identifiant d'appairage du poste de caisse (register).
- Lié : Oui · Suivi : Non · Finalité : Fonctionnement de l'app.

### Contenu utilisateur (User Content)
- **Autre contenu utilisateur** — catalogue produits, notes/fiches clients,
  logo de l'établissement (imprimé sur le ticket).
- **Données d'assistance** — messages envoyés via l'entrée « Assistance ».
- Lié : Oui · Suivi : Non · Finalités : Fonctionnement de l'app, Assistance.
- Note : si un logo ou des photos de produits sont importés, cocher aussi
  **Photos ou vidéos** (même finalité).

---

## 2) Données NON collectées

À déclarer « non collectées » :

- **Localisation** (aucune géolocalisation).
- **Santé et forme**.
- **Informations sensibles**.
- **Contacts** (carnet d'adresses de l'appareil — non lu).
- **Historique de navigation** / **Historique de recherche**.
- **Données d'utilisation** (Product Interaction / données publicitaires) —
  aucun analytics dans l'app. (Le site vitrine peut mesurer des conversions,
  mais ce n'est pas l'app.)
- **Diagnostics** (données de plantage/performance) — aucun SDK de crash
  (pas de Sentry/Firebase/etc.). Les rapports de plantage éventuels d'iOS vont
  à Apple, pas à l'éditeur.

---

## 3) Suivi (Tracking)

**Aucune donnée utilisée pour le suivi.** Section « Données utilisées pour vous
suivre » : **vide**. Pas de framework App Tracking Transparency requis.

---

## 4) Points à confirmer avant soumission

- **Informations financières** : la déclaration ci-dessus retient « Autres
  informations financières » (montants + RIB de l'établissement) par prudence.
  À valider avec ton conseil ; si tu ne veux déclarer que les achats, retire ce
  bloc et garde « Achats ».
- **Photos ou vidéos** : à cocher seulement si logo/photos produits importés.
- **URL de politique de confidentialité** : `https://hellopos.fr/confidentialite`
- **URL de support** : `https://hellopos.fr/support`

Cohérent avec la politique publiée sur `hellopos.fr/confidentialite`.
