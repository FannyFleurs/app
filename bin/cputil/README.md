# CPUtil

Outil en ligne de commande de Star Micronics. Il convertit un document
**Star Document Markup** en commandes imprimante StarPRNT.

C'est lui qui traduit `[feed: black-mark]` — « avance jusqu'à la marque noire
suivante » — en la séquence que la mC-Label3 attend. Sans lui, le logiciel
retombe sur un encodage direct qui imprime correctement mais ne recale pas le
support entre deux étiquettes : la dérive cumulative revient.

## Le binaire n'est pas versionné

Il pèse plusieurs dizaines de mégaoctets et appartient à Star. À déposer ici :

```
bin/cputil/cputil        # binaire Linux x64, exécutable
```

## Où le prendre

CloudPRNT SDK de Star — binaires natifs pour Linux x64, macOS et Windows :

- https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/cputil.html
- source : https://github.com/star-micronics/cloudprnt-sdk

Prendre la version **Linux x64** : les fonctions Vercel tournent sur Amazon
Linux, en x86_64. Une version macOS ou arm64 ne s'exécutera pas.

## Après l'avoir déposé

```bash
chmod +x bin/cputil/cputil
git add -f bin/cputil/cputil     # si un .gitignore l'écarte
```

Vérifier la syntaxe réellement acceptée par le binaire livré :

```bash
./bin/cputil/cputil --help
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
