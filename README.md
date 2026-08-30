# Système de Gestion Multi-Boutique — Pièces Cycles & Motos

Solution complète offline-first de point de vente (POS) et de gestion commerciale pour magasins de pièces détachées de cycles et motocycles en Algérie.

---

## 🏗️ Architecture du Projet (Monorepo)

- **`apps/desktop`** :
  - **Tauri v2 (Rust + WebView2 + SQLite)** : Exécutable natif ultra-léger (10.48 Mo, 40 Mo RAM) pour PC de caisse.
  - **Electron (Node.js + Chromium + Better-SQLite3)** : Exécutable portable alternatif (95.8 Mo).
- **`apps/server`** : Backend API Express + SQLite/PostgreSQL avec modèle de données Append-Only (sans conflits).
- **`apps/web`** : Portail Web propriétaire React + Tailwind CSS avec supervision multi-boutiques en temps réel.
- **`packages/shared`** : Types TypeScript partagés, constantes (135 couleurs, 36 modèles de motos, 10 modules système).

---

## 🚀 Déploiement Cloud sur Render.com (1-Click)

Le fichier `render.yaml` inclus à la racine configure automatiquement :
1. **Web Service (API Server)** :
   - Environnement : `Node`
   - Commande de build : `pnpm install && pnpm --filter @gestion-veloo/shared build && pnpm --filter @gestion-veloo/server build`
   - Commande de démarrage : `pnpm --filter @gestion-veloo/server start`
2. **Static Site (Portail Web)** :
   - Environnement : `Static`
   - Commande de build : `pnpm install && pnpm --filter @gestion-veloo/shared build && pnpm --filter @gestion-veloo/web build`
   - Répertoire publié : `./apps/web/dist`
   - Variable `VITE_API_URL` automatiquement liée au service backend.

### Étapes de Déploiement :
1. Pousser le code vers un dépôt GitHub :
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit - complete multi-store POS system"
   git remote add origin https://github.com/VOTRE_COMPTE/gestion-veloo.git
   git branch -M main
   git push -u origin main
   ```
2. Sur [Render.com](https://render.com) :
   - Cliquer sur **New +** → **Blueprint**
   - Sélectionner votre dépôt GitHub `gestion-veloo`
   - Render détectera automatiquement `render.yaml` et déploiera l'API et le Portail Web.

---

## 💻 Exécution en Local

### 1. Prérequis
- Node.js 18+ & pnpm
- Rust & Cargo (pour la compilation Tauri)

### 2. Démarrage Rapide
```bash
# Installation des dépendances
pnpm install

# Démarrer le serveur API (Port 3001)
pnpm --filter @gestion-veloo/server dev

# Démarrer le portail web (Port 5173)
pnpm --filter @gestion-veloo/web dev

# Démarrer l'application Desktop de caisse
pnpm --filter @gestion-veloo/desktop dev
```

### 3. Exécutables Desktop Prêts à l'Emploi
- **Tauri v2 (.exe natif)** : `apps/desktop/src-tauri/target/release/gestion-pos.exe` (**10.48 Mo**)
- **Electron (.exe portable)** : `apps/desktop/release/Gestion Pièces Cycles & Motos POS 1.0.0.exe` (**95.85 Mo**)

---

## 🔑 Identifiants de Démonstration

- **Gérant / Administrateur (Multi-boutiques)** :
  - Identifiant : `admin`
  - Mot de passe : `admin123`
- **Vendeur Magasin 1 (Centre-Ville)** :
  - Identifiant : `vendeur1`
  - Mot de passe : `vendeur123`
- **Vendeur Magasin 2 (Zone Industrielle)** :
  - Identifiant : `vendeur2`
  - Mot de passe : `vendeur123`
