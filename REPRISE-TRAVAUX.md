# Prompt de reprise — Gestion Pièces Cycles & Motos POS

> À coller tel quel dans Antigravity (ou tout autre agent) si la session en
> cours s'arrête avant la fin. Tout ce qui suit est vérifié au 1er octobre 2026.

---

## Contexte

Monorepo pnpm, application de point de vente Electron pour un magasin de pièces
détachées moto en Algérie. Montants **en centimes** partout. Interface en
français (arabe partiel).

```
apps/desktop      Electron + React + Vite (l'application livrée)
apps/server       Express + SQLite/Postgres (portail central, optionnel)
apps/web          Portail React
packages/shared   Règles métier pures, partagées process principal / interface
```

**Dépôt** : `https://github.com/zineeddineabdelbakidaoudi-maker/GESTION_D-UNE_MAGASIN_DES_PIECES_DETACHE`
**Branche de travail** : `feat/rbac-audit-costing` (poussée à jour)
**Version applicative** : `2.2.0` (dans `apps/desktop/package.json`)
**Tag poussé** : `v2.2.0`

---

## ⚠️ LA SEULE CHOSE QUI RESTE À FAIRE

**Publier les deux exécutables de la 2.2.0 sur la release GitHub `v2.2.0`.**

Sans ça, le lien `/releases/latest/download/...` — celui qu'encode le QR code
remis au client — continue de servir la **v2.0.0 du 26 septembre**, c'est-à-dire
une application **sans** l'habillage classique, **sans** l'essai 7 jours,
**sans** le stock par couleur et **sans** le prix plancher.

### Les fichiers (déjà construits, déjà testés)

| Fichier local | Nom à donner sur la release |
|---|---|
| `apps/desktop/release3/Gestion-POS-Portable-2.2.0.exe` | `Gestion-Pieces-Moto-POS-Portable.exe` |
| `apps/desktop/release3/Gestion-POS-Setup-2.2.0.exe` | `Gestion-Pieces-Moto-POS-Setup.exe` |

Les noms de destination **ne sont pas négociables** : le README et le QR code
pointent dessus.

### Pourquoi ce n'est pas fait

Le dépôt n'a pas de workflow GitHub Actions, `gh` (GitHub CLI) n'est pas
installé sur le poste, et l'API REST demande un jeton. Le seul jeton disponible
est celui du gestionnaire d'identifiants Windows ; **le lire pour l'envoyer à
l'API est un geste qu'un agent ne doit pas faire** (c'est le secret de
l'utilisateur) et le garde-fou de sécurité l'a refusé deux fois, à juste titre.

### Les trois façons d'en finir

**A. Par le navigateur (2 minutes, aucun outil à installer)**

Ouvrir, le tag existe déjà :
```
https://github.com/zineeddineabdelbakidaoudi-maker/GESTION_D-UNE_MAGASIN_DES_PIECES_DETACHE/releases/new?tag=v2.2.0
```
Glisser-déposer les deux `.exe`, **les renommer** selon le tableau ci-dessus,
publier.

**B. Par le GitHub CLI** — l'agent peut tout faire ensuite, sans jamais voir le
jeton :
```powershell
winget install GitHub.cli
gh auth login
```
puis :
```powershell
cd "C:\Users\zinouuuuu\GESTION VELOOOOO"
Copy-Item apps\desktop\release3\Gestion-POS-Portable-2.2.0.exe $env:TEMP\Gestion-Pieces-Moto-POS-Portable.exe
Copy-Item apps\desktop\release3\Gestion-POS-Setup-2.2.0.exe    $env:TEMP\Gestion-Pieces-Moto-POS-Setup.exe
gh release create v2.2.0 "$env:TEMP\Gestion-Pieces-Moto-POS-Portable.exe" "$env:TEMP\Gestion-Pieces-Moto-POS-Setup.exe" --title "v2.2.0" --notes-file NOTES-2.2.0.md
```

**C. Mettre en place un workflow GitHub Actions** qui construit et publie sur
chaque tag, avec le `GITHUB_TOKEN` automatique (aucun secret à manipuler).
Plus propre à long terme, mais la construction Electron sur un runner Windows
avec `better-sqlite3` natif demande du réglage.

### Vérifier que c'est bon

```bash
curl -sI "https://github.com/zineeddineabdelbakidaoudi-maker/GESTION_D-UNE_MAGASIN_DES_PIECES_DETACHE/releases/latest/download/Gestion-Pieces-Moto-POS-Portable.exe" | grep -i location
```
La redirection doit citer **`v2.2.0`**. Tant qu'elle cite `v2.0.0`, **ne pas
diffuser le QR code au client**.

---

## État des travaux — tout le reste est fait et vérifié

| Demande | État |
|---|---|
| Règle du prix d'achat (dominant sous 5 unités, médiane au-delà) | fait, testé |
| Rôles, permissions, journal d'audit | fait, testé |
| Habillage « Classique » type WinDev / Windows Forms | fait, vu à l'écran |
| Écran Produit classique : barre d'icônes, sous-onglets, libellé en face du champ | fait, vu à l'écran |
| Essai porté à 7 jours + script de réactivation | fait, vu à l'écran |
| Catégories de dépenses, tri du catalogue, thème crème | fait |
| Quantité par couleur, total auto-calculé | fait, vu à l'écran |
| La caisse demande la couleur vendue | fait, vu à l'écran |
| Prix et remise jamais sous le prix d'achat | fait, vu à l'écran |
| PDF installation + dépannage, dossier de livraison, QR code | fait |
| **Publication des .exe 2.2.0** | **à faire — voir ci-dessus** |

---

## Comment travailler sur ce projet

### Vérifier

```bash
cd apps/desktop && npx tsc --noEmit -p tsconfig.json     # typecheck
cd apps/desktop && node tests/run.cjs                     # 101 vérifications
```

`better-sqlite3` est compilé pour l'ABI d'Electron : **il ne se charge pas
depuis le Node du système**. `tests/run.cjs` relance donc les suites à travers
le binaire Electron (`ELECTRON_RUN_AS_NODE=1`). Tout script qui touche la base
doit faire pareil — voir `scripts/reactiver-licence.cjs`, qui se relance
lui-même.

Après toute modification de `packages/shared`, **reconstruire le paquet** :
`cd packages/shared && npx tsc`. Le process principal lit `dist/`, pas les
sources.

### Construire

```bash
cd apps/desktop
npx tsc && npx vite build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --config.directories.output=release3
node ../../scripts/package-livraison.mjs --release-dir=release3
```

Construire dans `release3/` et non `release/` : l'utilisateur fait tourner sa
propre instance depuis `release/`, et electron-builder ne peut pas réécrire un
exécutable en cours d'exécution. **Arrêter toute instance de test avant de
construire**, sinon `win-unpacked` est verrouillé.

### Vérifier sur l'application réelle — ne pas s'en passer

C'est ce qui a permis de trouver des défauts que la lecture du code ne montrait
pas (texte invisible en thème clair, « Invalid Date », et un pincement de prix
qui transformait « 500 » en « 1000500 »).

```powershell
# lancer avec un profil isolé
cd "apps\desktop\release3\win-unpacked"
.\"Gestion Pieces Cycles et Motos POS.exe" --user-data-dir="<dossier temporaire>"

# piloter : clic, molette, touches — en UN SEUL appel, sinon le focus se perd
scripts\piloter-fenetre.ps1 -ProcessId <pid> -ClickX 683 -ClickY 323 -Keys "admin{TAB}admin123{ENTER}" -DelayMs 4500
scripts\piloter-fenetre.ps1 -ProcessId <pid> -ClickX 683 -ClickY 450 -Scroll -7

# capturer et relire l'image
scripts\capture-fenetre.ps1 -ProcessId <pid> -Out "<chemin>.png" -DelaySeconds 1
```

Identifiants de démonstration : `admin` / `admin123` (propriétaire),
`vendeur1` / `vendeur123` (caissier). **Le compte se verrouille après 5 échecs**
— attention au verrouillage majuscules, qui a déjà fait échouer deux tentatives.

---

## Règles métier à ne pas casser

1. **Prix d'achat** (`packages/shared/src/domain/costing.ts`) : à chaque
   réception, si le stock restant avant l'achat est **sous 5 unités**, le
   nouveau prix devient dominant ; au-delà, c'est la **médiane** ancien/nouveau.
   Seuil réglable dans les paramètres.
2. **Coût figé à la vente** (`sale_items.unit_cost_snapshot`) : modifier le prix
   d'achat plus tard ne doit jamais changer un bénéfice historique.
3. **Prix plancher** (`packages/shared/src/domain/pricing.ts`) : ni le prix
   unitaire ni la remise ne descendent sous le prix d'achat. Appliqué dans
   l'interface **et** dans le process principal — l'interface n'est jamais la
   source de vérité.
4. **Stock par couleur** : pour un article `color_stock_tracked = 1`, la somme
   de `product_color_stock` doit **toujours** égaler `product_stock`. Toute
   nouvelle opération qui bouge du stock doit nommer sa couleur, sinon elle est
   refusée. C'est l'invariant le plus fragile du projet.
5. **Permissions** (`packages/shared/src/domain/rbac.ts`) : `can()` est la seule
   autorité, utilisée à l'identique par le process principal, l'API et
   l'interface.
6. **Journal d'audit** : append-only, avec l'avant/après de chaque champ.

---

## Pièges rencontrés — ne pas les redécouvrir

- **Disque presque plein** : il restait **1,4 Go** sur 238 Go. Un build
  electron-builder qui échoue sur `can't write 67108864 bytes to output`, c'est
  ça. Récupérable : `AppData\Local\electron\Cache` (~670 Mo).
- **`@layer components` dans un CSS sans `@tailwind components`** : PostCSS
  refuse. `skin-classique.css` n'a donc pas de wrapper.
- **Les codemods sur les classes CSS** cassent les ternaires qui n'en sont pas
  (`isDark ? 'Clair' : 'Sombre'`, couleurs Recharts). Vérifier à l'écran.
- **Les chaînes de couleur hors attribut `className`** (dans des `const`)
  échappent aux codemods — bogue de contraste déjà vécu.
- **`.CMD` non exécutables via `spawn`** sous Windows : invoquer
  `require.resolve('typescript/bin/tsc')` avec `process.execPath`.
- Dans l'écriture de scripts : attention aux antislashs mangés par certaines
  couches shell. Préférer écrire le script dans un fichier.

---

## Ce qui reste ouvert, par ordre d'importance

1. **Publier les .exe 2.2.0** (voir plus haut) — bloquant pour le client.
2. Les deux PDF de `livraison/` ne décrivent ni l'habillage classique, ni
   l'essai 7 jours, ni le stock par couleur. Régénérer :
   `python docs/build_all.py`.
3. La branche `feat/rbac-audit-costing` n'est pas fusionnée dans `main`.
4. Le mécanisme d'essai **n'est pas une protection** : la date est une ligne en
   clair dans le SQLite du poste. Une vraie licence demanderait une clé signée
   liée au `deviceId` (déjà présent dans l'application).
5. Les mots de passe par défaut sont en clair dans `apps/desktop/electron/db.ts`
   et identiques sur chaque installation. Mettre `users.must_change_password`
   à 1 pour forcer le changement à la première connexion.
