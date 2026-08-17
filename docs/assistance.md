# Demandes d'assistance

Canal d'aide intégré à l'application : le commerçant signale un problème ou
demande une amélioration depuis la caisse ou le back-office, l'opérateur le
traite dans la console d'administration, et la réponse revient sur l'écran d'où
la demande est partie.

## 1. Le parcours

| Étape | Où | Qui |
| --- | --- | --- |
| Envoi de la demande | Menu → Système → **Assistance** (`/support`) | tout utilisateur connecté |
| Réception | Console → **Demandes d'assistance** (`/admin/support`) + email | opérateur (`super_admin`) |
| Traitement | même page : état, réponse, note interne | opérateur |
| Retour au commerçant | fenêtre sur l'écran d'où la demande est partie | automatique |
| Clôture | bouton « J'ai lu » de cette fenêtre | commerçant |

Les états : `nouveau` → `en_cours` → `traite` → `clos`. Une demande clôturée ne
se rouvre pas (l'API renvoie 409) : sa réponse a déjà été lue. Une demande
traitée peut en revanche revenir en cours si la réponse n'était pas la bonne.

## 2. Ce qui part avec la demande

Le commerçant répond à trois questions — la nature (problème / amélioration),
une ligne de titre, le récit — plus le niveau de gêne quand c'est une panne.
Le reste est relevé automatiquement, parce que c'est précisément ce qu'il ne
sait pas fournir et ce dont le traitement a besoin :

- l'écran d'où il écrit (`page_path`) ;
- l'application (`caisse` ou `bo`) ;
- la référence du poste (`HP-XXXXXX`) quand l'appareil est lié à une caisse ;
- le navigateur.

## 3. La capture d'écran

Recommandée, jamais obligatoire : on ne bloque pas le signalement d'une panne
derrière une manipulation qui peut elle aussi échouer.

Trois chemins, dans `lib/support/screenshot.ts` :

1. **Capturer l'écran** — `getDisplayMedia`, le navigateur propose de partager
   l'onglet ou l'écran, on en prend une image et on coupe le flux aussitôt. Le
   bouton n'apparaît que si le navigateur sait le faire.
2. **Joindre une image** — la capture faite avec les boutons de la tablette.
3. **Coller** (Ctrl+V) — le geste le plus court sur un ordinateur.

Dans les trois cas l'image est réduite à 1400 px et compressée en JPEG (qualité
0,72) : elle voyage dans le corps JSON de la demande et finit dans une colonne
`TEXT`, comme la photo produit prise au PDA. L'API plafonne à 1,5 Mo.

Les listes ne chargent jamais la capture : elles ne renvoient qu'un booléen
`has_screenshot`, l'image se lit par
`GET /api/admin/support-tickets/<id>?screenshot=1`.

## 4. La fenêtre de réponse

`components/SupportNotifier.tsx`, monté dans `AppShell` — donc présent sur
toutes les pages de la caisse et du back-office. Il sonde
`/api/support/updates` toutes les deux minutes.

La fenêtre s'ouvre **en priorité sur l'écran d'où la demande est partie** :
c'est là que le problème a été vu, et souvent là que le commerçant vérifiera
que c'est réglé. Si l'utilisateur travaille ailleurs, la réponse la plus
ancienne est présentée quand même — une réponse ne doit pas attendre
indéfiniment un retour sur une page précise.

Fermer la fenêtre vaut accusé de lecture : la demande passe en clôturée.
L'accusé n'est accepté que de l'auteur de la demande (filtre `created_by` en
base), et il est idempotent.

## 5. La notification email

À chaque nouvelle demande, un email part vers l'adresse de contact de la
plateforme (`lib/email/platform.ts`, partagé avec les demandes de contact du
site vitrine). La plateforme n'ayant pas de compte Brevo à elle, on emprunte la
configuration email d'une organisation opératrice.

L'objet porte le niveau en tête — `[BLOQUANT] Fanny Fleurs — Caisse figée` :
une caisse à l'arrêt ne se lit pas au milieu d'une liste. Le `reply-to` pointe
sur l'auteur, on répond donc directement depuis sa boîte.

**L'email est « best-effort »** : la demande est enregistrée d'abord, notifiée
ensuite. Sans configuration email, rien n'est envoyé et la demande apparaît
quand même dans la console.

## 6. Droits

La permission `support.request` est ouverte à **tous les rôles**, y compris
`lecture_seule` et `comptable` : la personne qui constate la panne tient le
comptoir, ce n'est pas forcément celle qui a les droits. L'entrée de menu est
`required` — une boutique ne peut pas la masquer depuis Gestion d'accès, sinon
elle n'aurait plus de chemin pour signaler la panne.

Côté opérateur, tout passe par `requireSuperAdmin`.

## 7. Base

Migration `0070_support_tickets.sql`. Isolation par tenant (RLS, politique
`tenant_isolation` « fail-open si GUC absent ») : une organisation ne voit que
ses demandes, l'opérateur passe en bypass. Vérifié avec un rôle non superuser —
un superuser Postgres contourne toujours RLS, ce n'est pas un défaut de la
politique.

Trois index : la liste de la boutique, la file de traitement, et les réponses
non lues d'un utilisateur (index partiel, c'est le sondage le plus fréquent).

## 8. Vérification manuelle

1. Menu → Système → Assistance, envoyer un problème bloquant avec une capture.
2. Console → Demandes d'assistance : la demande apparaît en tête avec sa
   capture, son écran et sa référence de poste.
3. Passer en « Traité » sans commentaire → refusé (422) : le commentaire est ce
   que lira le commerçant.
4. Avec commentaire → enregistré, la demande passe en « Traité ».
5. Retour côté commerçant : la fenêtre s'ouvre avec le commentaire.
6. « J'ai lu » → la demande passe en « Clôturé » et la fenêtre ne revient pas.
