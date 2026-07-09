# Déploiement HelloPos sur Vercel + Neon

Guide pas-à-pas pour mettre HelloPos en ligne en **30 minutes**, avec
auto-déploiement à chaque `git push`. Stack : Vercel (app Next.js) + Neon
(Postgres serverless, région Frankfurt = UE).

**Coût** : 0 € sur les tiers gratuits, largement suffisants pour 1 fleuriste.

---

## 1. Créer la base Postgres (Neon) — 5 min

1. Va sur https://neon.tech, crée un compte (GitHub OK).
2. Crée un nouveau projet :
   - **Project name** : `webpos`
   - **Postgres version** : 16 (par défaut)
   - **Region** : **Frankfurt (eu-central-1)** ← important pour la latence avec Vercel et la résidence UE
3. Une fois créé, tu arrives sur le dashboard. À gauche : **Connection Details**.
4. **IMPORTANT** : sélectionne « **Pooled connection** » (pas la "direct").
   Sur Vercel serverless, chaque requête peut créer un process — sans pooler,
   tu épuises la limite de connexions.
5. Copie l'URL complète, du genre :
   ```
   postgresql://webpos_owner:xxx@ep-cool-name-12345-pooler.eu-central-1.aws.neon.tech/webpos?sslmode=require
   ```
6. Garde cet onglet ouvert.

**Sauvegardes** : Neon les fait automatiquement (point-in-time recovery
sur 7 jours en tier gratuit, 30 jours en payant). Tu peux restaurer
n'importe quelle minute des 7 derniers jours depuis le dashboard.

---

## 2. Préparer le repo GitHub — 2 min

Le repo est déjà sur GitHub (`FannyFleurs/app`). Vérifie que ton dernier
commit est poussé :

```bash
git status
git push
```

Si tu travailles sur la branche `claude/florist-pos-saas-YTnPw`, Vercel
peut déployer cette branche. Mais pour une "prod" propre, merge-la dans
`main` après validation.

---

## 3. Créer le projet Vercel — 5 min

1. Va sur https://vercel.com, crée un compte (avec GitHub).
2. Clique **Add New → Project**.
3. Sélectionne le repo `FannyFleurs/app`. Vercel détecte automatiquement
   Next.js.
4. **Framework Preset** : Next.js (auto-détecté).
5. **Root Directory** : `./` (laisse par défaut).
6. **Build Command** : Vercel utilisera automatiquement `vercel-build`
   défini dans `package.json` (qui exécute `npm run db:migrate && next
   build`). **N'override pas.**
7. **NE clique PAS encore sur Deploy**. Va d'abord configurer les
   variables d'environnement (étape 4).

---

## 4. Configurer les variables d'environnement — 5 min

Toujours sur l'écran de configuration du projet Vercel, déroule
**Environment Variables**.

### Générer les secrets

Sur ton Mac, ouvre un terminal :

```bash
# Secret de session JWT
openssl rand -hex 32
# → copie le résultat (64 caractères hex)

# Clé de signature des événements fiscaux
openssl rand -hex 32
# → copie le résultat (un autre, différent)
```

⚠ **Note ces deux valeurs dans ton gestionnaire de mots de passe** :
- Si tu perds `SESSION_SECRET` : tous les utilisateurs sont déloggés
  immédiatement à la prochaine rotation.
- Si tu perds `FISCAL_SIGNING_KEY` : tu ne pourras plus vérifier
  l'intégrité des événements fiscaux passés. C'est dramatique pour la
  compliance — sauvegarde-la quelque part hors Vercel.

### Renseigner les variables dans Vercel

Ajoute les 3 variables suivantes (clique « Add another » entre chaque) :

| Variable | Valeur | Environnements |
|---|---|---|
| `DATABASE_URL` | l'URL Pooled copiée depuis Neon | Production, Preview, Development |
| `SESSION_SECRET` | la 1ʳᵉ valeur hex de openssl | Production, Preview, Development |
| `FISCAL_SIGNING_KEY` | la 2ᵉ valeur hex de openssl | Production, Preview, Development |

Optionnellement :

| Variable | Valeur | Notes |
|---|---|---|
| `SESSION_TTL_MINUTES` | `480` | durée session (min). Défaut 480 = 8 h. |

---

## 5. Premier déploiement — 3 min

1. Clique **Deploy**.
2. Vercel installe les dépendances, lance `npm run vercel-build` qui :
   - applique les migrations DB (0001 → 0018) via `tsx scripts/migrate.ts`
   - build Next.js (`next build`)
3. Au bout de ~2 min, tu obtiens une URL `https://webpos-xxx.vercel.app`.
4. Ouvre-la dans un navigateur → tu arrives sur `/login` mais aucun
   utilisateur n'existe encore → "Aucun utilisateur configuré".

---

## 6. Créer le premier utilisateur — 2 min

Deux options :

### Option A — Via le wizard `/setup` (recommandé pour Fanny Fleurs)
Va sur `https://webpos-xxx.vercel.app/setup` et remplis le wizard :
- Nom de la boutique
- Tes informations (admin)
- Email + mot de passe + PIN à 4 chiffres

Tu seras directement connecté en tant qu'admin de Fanny Fleurs.

### Option B — Créer un super-admin SaaS (pour gérer plusieurs clients)

**Procédure simplifiée via la page `/init-admin`** :

1. Sur ton Mac, génère un secret aléatoire :
   ```bash
   openssl rand -hex 24
   ```
2. Va sur Vercel → Settings → Environment Variables, ajoute :
   - `INIT_SECRET` = la valeur générée ci-dessus
3. Vercel → Deployments → onglet le plus récent → **« Redeploy »** (pour que la nouvelle variable soit prise en compte)
4. Une fois le redeploy fini, ouvre :
   `https://webpos-xxx.vercel.app/init-admin`
5. Remplis le formulaire :
   - Nom complet : `Jonathan` (par exemple)
   - Email : `contact@swebio.fr`
   - Mot de passe : choisis-en un fort (note-le dans ton gestionnaire)
   - Secret d'initialisation : colle la valeur de `INIT_SECRET`
6. Clique **« Créer le super-admin »** → confirmation
7. Va sur `https://webpos-xxx.vercel.app/login`, clique **« Accès admin et autres »**, connecte-toi avec ton email + mot de passe.
8. Tu accèdes à `/admin` pour gérer toutes les organisations clientes.

⚠ Une fois ton compte créé, la page `/init-admin` refuse toute nouvelle
création (`SUPER_ADMIN_ALREADY_EXISTS`). Pour ajouter d'autres super-admin
par la suite, utilise `/admin` ou le script `npm run create:super-admin`.

Tu peux ensuite **supprimer la variable `INIT_SECRET`** dans Vercel
(plus utile) et redéployer.

---

## 7. Boucle de développement — workflow quotidien

À partir de maintenant, chaque `git push` déploie automatiquement.

```bash
# 1. Modifie du code
vim app/(app)/caisse/CashRegister.tsx

# 2. Teste en local
npm run dev

# 3. Quand tu es content :
git add -A
git commit -m "feat: …"
git push

# 4. Vercel build + déploie en ~2 min
# 5. L'URL prod reflète automatiquement le nouveau code
```

### Preview deployments
Chaque push sur une branche autre que `main` crée une URL « preview »
isolée (avec sa propre URL, mêmes vars d'env). Tu peux ainsi tester une
feature avant de la merger.

### Migrations DB
Toute nouvelle migration `migrations/00XX_xxx.sql` sera appliquée
automatiquement au prochain deploy via `vercel-build`. Les migrations
sont idempotentes (sha-check), donc safe.

⚠ **Attention** : Vercel deploye en parallèle (preview + prod). Si tu
crées une nouvelle colonne, l'ancienne preview avec son ancien code peut
casser. Préfère ajouter la colonne d'abord (1 deploy), puis utiliser la
nouvelle colonne (2ᵉ deploy).

---

## 8. Tests grandeur nature — checklist avant la 1ʳᵉ vente réelle

- [ ] Tu as **noté SESSION_SECRET et FISCAL_SIGNING_KEY** ailleurs que Vercel
- [ ] Tu as **vérifié les sauvegardes Neon** : dashboard → Backup history
- [ ] Tu peux faire une **vente fictive** : login → ouvrir caisse → ajouter article → encaisser
- [ ] Tu peux **télécharger le PDF du ticket** depuis Ma journée
- [ ] Tu peux **clôturer la journée** (X puis Z) et la PDF Z s'ouvre
- [ ] Si tu utilises Stripe : tu as testé un **lien de paiement** avec une carte de test (`4242 4242 4242 4242`)
- [ ] Tu sais où voir les **logs en cas de pépin** : Vercel → Deployments → ton deploy → Function logs

---

## 9. Limites du tier gratuit

| Tier gratuit | Limite | Pour HelloPos |
|---|---|---|
| Vercel Hobby | 100 GB-h serverless / mois | OK pour 1 fleuriste (~5 GB-h/mois) |
| Vercel Hobby | 100 GB bandwidth / mois | OK |
| Neon Free | 0.5 GB storage | OK pour ~50 000 ventes |
| Neon Free | 191.9 compute-h/mois | Suffit pour 1 boutique en activité standard |

Quand tu passeras au tier payant (Vercel Pro 20 $/mois + Neon Launch
19 $/mois) :
- Plus de bandwidth + plus de compute
- Sauvegardes Neon sur 30 jours
- Support prioritaire

---

## 10. Passer plus tard à un VPS (Scaleway, OVH…)

Quand le produit est validé et que tu veux 100 % le contrôle :

1. Crée un VPS (Scaleway DEV1-M, ~5 €/mois, région Paris)
2. Installe Docker + Docker Compose
3. `pg_dump` depuis Neon, restore sur Postgres local
4. Lance le container HelloPos via docker-compose
5. Caddy en façade pour HTTPS auto
6. Bascule le DNS (Cloudflare conseillé)

Je peux te générer ces fichiers (Dockerfile, docker-compose.yml,
Caddyfile, script de backup nightly vers S3) quand tu seras prêt à
sauter le pas. Demande-moi `prépares-moi le déploiement VPS`.

---

## Aide rapide

- **Logs runtime** : Vercel → Deployments → onglet « Logs »
- **Logs build (migrations)** : Vercel → Deployments → cliquer sur un deploy → « Building »
- **Console SQL** : Neon → SQL Editor (pratique pour debug rapide)
- **Restauration DB** : Neon → Backup history → Restore to point in time

Un souci ? Garde le message d'erreur Vercel + le stacktrace,
je peux t'aider à diagnostiquer.
