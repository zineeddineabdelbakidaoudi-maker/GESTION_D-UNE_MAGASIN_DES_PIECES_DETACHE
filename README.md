# Système de Gestion Multi-Boutique — Pièces Cycles & Motos

Solution offline-first de point de vente (POS) et de gestion commerciale pour magasins de
pièces détachées de cycles et motocycles en Algérie.

- **`apps/desktop`** — application de caisse **Electron** (Node + Chromium + better-sqlite3).
  Toute la logique métier vit dans le process principal ; le renderer n'est qu'une interface.
- **`apps/server`** — API centrale Express + SQLite/PostgreSQL : reçoit les données des caisses.
- **`apps/web`** — portail web du propriétaire : supervision multi-boutiques et journal d'audit.
- **`packages/shared`** — types, règles métier et vocabulaire partagés par les trois applications.

---

## 🔐 Comptes livrés à l'installation

| Identifiant | Mot de passe | Rôle | Portée |
|---|---|---|---|
| `admin` | `admin123` | Propriétaire | Toutes les boutiques, tous les modules |
| `vendeur1` | `vendeur123` | Caissier | Boutique 1 |
| `vendeur2` | `vendeur123` | Caissier | Boutique 2 |

> **Changez ces mots de passe à la première connexion** (icône clé dans la barre du haut).
> Le propriétaire peut ensuite créer les comptes réels depuis *Utilisateurs & Rôles*.

---

## 📐 Règles métier appliquées

### Prix d'achat après une réception

À chaque bon d'achat, le prix d'achat de l'article est recalculé ligne par ligne :

| Stock restant **avant** la réception | Prix d'achat retenu |
|---|---|
| **< 5 unités** (seuil réglable) | Le **nouveau prix devient dominant** : il remplace l'ancien |
| **≥ 5 unités** | **Médiane** : `(ancien prix + nouveau prix) ÷ 2` |

Cas particuliers : sans prix connu, le prix reçu devient la référence ; un prix entrant nul
laisse l'ancien inchangé.

Le seuil se règle dans *Paramètres → Règles de stock & de prix d'achat*.
Chaque recalcul est écrit dans `product_cost_history` avec sa justification, visible dans
l'application (fiche article) et dans le portail (onglet *Prix d'achat*).

### Mouvements de stock

| Code | Événement | Effet |
|---|---|---|
| 90 | Achat / réception | Stock **+** |
| 91 | Vente | Stock **−** |
| 92 | Retour client | Stock **+** |
| 93 | Ajustement manuel | **±** (motif obligatoire) |
| 94 / 95 | Transfert inter-boutique | **−** / **+** |

Chaque opération est une transaction SQLite unique. Une vente au-delà du stock disponible est
refusée, sauf si le stock négatif est explicitement autorisé dans les paramètres.

### Bénéfices

- Le **coût unitaire est figé** sur chaque ligne de vente au moment de l'encaissement.
  Modifier un prix d'achat plus tard ne réécrit jamais un bénéfice passé.
- `Bénéfice brut = Σ (prix de vente − coût figé) × quantité − marge annulée par les retours`
- `Bénéfice net = Bénéfice brut − dépenses de la période`
- Les pertes **ne sont pas ramenées à zéro** : un bénéfice négatif s'affiche tel quel.
- Un retour rembourse au prix réellement facturé (remise globale proratisée), solde d'abord
  la dette du client puis le reliquat en espèces, et repasse la vente en
  `partial_return` ou `returned` selon ce qui reste à retourner.

---

## 👥 Rôles & permissions

| Rôle | Portée |
|---|---|
| **Propriétaire** | Tout, y compris la gestion des comptes et le journal d'audit |
| **Gérant** | Sa boutique : ventes, achats, stock, dépenses, rapports. Pas de gestion de comptes |
| **Caissier** | Encaissement et clients. Ne voit ni les prix d'achat ni les rapports financiers |
| **Auditeur** | Consultation seule de toutes les données et du journal |

Le rôle pré-remplit une matrice de permissions, puis **chaque module reste ajustable
individuellement** (consulter / modifier) depuis *Utilisateurs & Rôles*.

La même fonction `can()` de `packages/shared` décide côté interface, côté process principal
Electron et côté API : aucune couche ne peut diverger. L'interface masque ce qui est interdit,
et le process principal le refuse de toute façon.

Sécurité des comptes : mots de passe bcrypt, verrouillage 15 min après 5 échecs, déconnexion
automatique après 60 min d'inactivité, session détenue par le process principal (jamais par
le renderer).

---

## 📜 Journal d'audit

Registre **en ajout seul**. Chaque opération enregistre l'auteur, la boutique, le poste,
l'objet concerné, un résumé lisible, le **détail avant/après** des champs modifiés et le
contexte technique.

Sont journalisés notamment : connexions et échecs de connexion, verrouillages de compte,
**accès refusés**, créations et modifications d'articles, recalculs de prix d'achat, ventes,
annulations, retours, bons d'achat, ajustements et transferts de stock, dépenses,
changements de paramètres, créations de comptes et modifications de permissions.

Consultable depuis l'application (*Journal d'audit*) et depuis le portail
(*Supervision & Traçabilité*), avec filtres, recherche, pagination et export CSV.

---

## ☁️ Liaison caisse ↔ portail

1. Côté serveur, définir la variable d'environnement **`SYNC_API_KEY`** (chaîne longue et aléatoire).
2. Côté caisse, *Paramètres → Portail central & synchronisation* : renseigner l'adresse du
   serveur et la **même clé**, puis « Tester la synchronisation ».

Sans clé configurée sur le serveur, les envois sont acceptés mais marqués *non authentifiés*
dans le portail et signalés dans les journaux — configurez-la en production.

Chaque synchronisation pousse ventes, achats, retours, mouvements de stock, dépenses,
historique des prix d'achat et **journal d'audit**. Les envois sont dédupliqués : rejouer un
lot ne crée jamais de doublon. La caisse fonctionne normalement hors ligne ; les entrées non
transmises restent marquées « en attente ».

Autres variables serveur : `JWT_SECRET` (obligatoire en production), `DATABASE_URL`
(PostgreSQL ; sans elle, SQLite local), `PORT`.

---

## 💻 Exécution en local

```bash
pnpm install
pnpm --filter @gestion-veloo/shared build

pnpm --filter @gestion-veloo/server dev    # API      → http://localhost:3001
pnpm --filter @gestion-veloo/web dev       # Portail  → http://localhost:5173
pnpm --filter @gestion-veloo/desktop dev   # Caisse Electron
```

## 📦 Construction de l'exécutable

```bash
pnpm --filter @gestion-veloo/desktop package
```

Sortie dans `apps/desktop/release/`.

---

## ✅ Tests

```bash
pnpm --filter @gestion-veloo/desktop test   # règles métier + migration
pnpm --filter @gestion-veloo/server test    # API : exécuter le serveur d'abord
```

Les tests de la caisse pilotent **les vrais handlers IPC** sur une base SQLite réelle :
règle du prix d'achat (branches dominante et médiane), incréments et décréments de stock,
refus de survente, retours partiels et totaux, écriture du journal, cloisonnement par rôle,
puis migration d'une base existante sans perte de données.

> `better-sqlite3` est compilé pour l'ABI d'Electron : le lanceur `apps/desktop/tests/run.cjs`
> réexécute automatiquement les suites via le binaire Electron en mode Node.

Le test serveur attend une API démarrée avec `SYNC_API_KEY=test-key-123` sur le port 3055 :

```bash
SYNC_API_KEY=test-key-123 PORT=3055 pnpm --filter @gestion-veloo/server dev
```

---

## 🚀 Déploiement Render

`render.yaml` décrit l'API et le portail. Après le premier déploiement, ajoutez
`SYNC_API_KEY` et `JWT_SECRET` dans les variables d'environnement du service API.
