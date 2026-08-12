# CPUtil

Outil en ligne de commande de Star Micronics. Il convertit un document
**Star Document Markup** en commandes imprimante StarPRNT.

C'est lui qui traduit `[feed: black-mark]` — « avance jusqu'à la marque noire
suivante » — en la séquence que la mC-Label3 attend. Sans lui, le logiciel
retombe sur un encodage direct qui imprime correctement mais ne recale pas le
support entre deux étiquettes : la dérive cumulative revient.

## Le binaire présent ici

`cputil` — **v2.0.1, Linux x64**, 48,6 Mo, ELF x86-64 auto-suffisant (.NET 8
embarqué, aucune installation requise). Versionné volontairement : les
fonctions Vercel n'ont pas de réseau au démarrage, le binaire doit voyager
avec le déploiement.

Il tourne sur Amazon Linux x86_64, l'architecture des lambdas Vercel. Une
version macOS ou arm64 ne s'exécuterait pas.

Source : CloudPRNT SDK de Star —
https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/cputil.html

## Pour le remplacer par une version plus récente

```bash
tar -xzf cputil-linux-x64_vXXX.tar.gz
cp cputil-linux-x64_vXXX/cputil-linux-x64/cputil bin/cputil/cputil
chmod +x bin/cputil/cputil
./bin/cputil/cputil            # affiche l'aide : vérifier que la syntaxe n'a pas bougé
```

Le code appelle :

```
cputil printarea 400 decode application/vnd.star.starprnt <fichier.stm> -
```

`printarea 400` = 50 mm à 203 dpi, la largeur de nos étiquettes. `-` écrit sur
la sortie standard. Si le binaire livré attend un autre ordre d'arguments,
c'est dans `lib/services/cloudprnt/cputil.ts` que ça se corrige, à un seul
endroit.

## Vérifier qu'il est bien pris

Le chemin peut être forcé par la variable d'environnement `CPUTIL_PATH`.
Avec `LABEL_JOB_HEXDUMP=1`, chaque job imprime son moteur dans les journaux :

```
[label-job] markup+cputil · 5 étiquette(s) · markup 41234 car. · 18922 octets
```

Si la ligne dit `starprnt-encoder`, le binaire n'a pas été trouvé.

## Ce que la conversion nous a appris

`[feed: black-mark]` se compile en **un seul octet : `0x0C`** (form feed).
Trouvé en comparant deux documents identiques, l'un avec le feed, l'autre
sans : un octet d'écart. Sur une imprimante réglée `Top Search Sensor = Black
Mark`, ce form feed avance jusqu'à la marque suivante — c'est le capteur qui
donne la distance.

C'est pourquoi le repli sans CPUtil (`lib/services/cloudprnt/starprnt.ts`)
produit désormais la même structure : image, `0x0C`, image, `0x0C`, …, coupe.

Coupe : CPUtil émet `1B 64 03` (coupe avec avance), le repli `1B 64 00`.
