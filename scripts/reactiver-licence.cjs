#!/usr/bin/env node
/**
 * Réactive la période d'essai d'un poste.
 *
 * L'essai court à partir de `first_install_date`, écrit dans la table
 * `app_config` au premier démarrage. Réactiver consiste à replacer cette date
 * à maintenant : le compteur repart pour TRIAL_DURATION_DAYS jours.
 *
 * `better-sqlite3` est compilé pour l'ABI d'Electron et ne peut pas être chargé
 * par le Node du système : le script se relance donc lui-même à travers le
 * binaire Electron en mode Node.
 *
 * Usage :
 *   node scripts/reactiver-licence.cjs                 # base du poste
 *   node scripts/reactiver-licence.cjs --base <chemin> # une autre base
 *   node scripts/reactiver-licence.cjs --etat          # consulter sans modifier
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps/desktop');

const args = process.argv.slice(2);
const lectureSeule = args.includes('--etat');
const idxBase = args.indexOf('--base');
const baseDemandee = idxBase !== -1 ? args[idxBase + 1] : null;

/** Durée lue dans le code partagé, pour ne jamais diverger de l'application. */
function dureeJours() {
  const fichier = path.join(ROOT, 'packages/shared/src/constants/index.ts');
  const m = fs.readFileSync(fichier, 'utf8').match(/TRIAL_DURATION_DAYS\s*=\s*(\d+)/);
  if (!m) throw new Error('TRIAL_DURATION_DAYS introuvable dans ' + fichier);
  return parseInt(m[1], 10);
}

/** Runtime Electron : dépendances de développement, sinon application empaquetée. */
function trouverElectron() {
  const direct = [
    path.join(ROOT, 'node_modules/electron/dist/electron.exe'),
    path.join(DESKTOP, 'node_modules/electron/dist/electron.exe'),
    path.join(ROOT, 'node_modules/electron/dist/electron'),
    path.join(DESKTOP, 'node_modules/electron/dist/electron')
  ].find(p => fs.existsSync(p));
  if (direct) return direct;

  for (const nom of ['release/win-unpacked', 'release3/win-unpacked', 'release2/win-unpacked']) {
    const dossier = path.join(DESKTOP, nom);
    if (!fs.existsSync(dossier)) continue;
    const exes = fs.readdirSync(dossier)
      .filter(n => n.toLowerCase().endsWith('.exe'))
      .map(n => path.join(dossier, n))
      .map(f => ({ f, taille: fs.statSync(f).size }))
      .sort((a, b) => b.taille - a.taille);
    if (exes.length) return exes[0].f;
  }
  return null;
}

function cheminBase() {
  if (baseDemandee) return path.resolve(baseDemandee);
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming');
  return path.join(appData, '@gestion-veloo/desktop/pos_local.sqlite');
}

// ── Premier passage : on se relance sous Electron ──────────────────────────
if (!process.env.GV_REACTIVATION) {
  const electron = trouverElectron();
  if (!electron) {
    console.error("Runtime Electron introuvable. Lancez « pnpm install » ou construisez l'application une fois.");
    process.exit(1);
  }
  const res = spawnSync(electron, [__filename, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GV_REACTIVATION: '1' }
  });
  process.exit(res.status === null ? 1 : res.status);
}

// ── Second passage : on a better-sqlite3 utilisable ────────────────────────
const base = cheminBase();
if (!fs.existsSync(base)) {
  console.error('Base introuvable : ' + base);
  console.error("Démarrez l'application une fois, ou indiquez le fichier avec --base <chemin>.");
  process.exit(1);
}

const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, DESKTOP] }));
const db = new Database(base);

const jours = dureeJours();
const dureeMs = jours * 24 * 60 * 60 * 1000;
const fmt = ms => new Date(ms).toLocaleString('fr-FR');

const ligne = db.prepare('SELECT value FROM app_config WHERE key = ?').get('first_install_date');
const debutActuel = ligne ? parseInt(ligne.value, 10) : null;

console.log('Base            : ' + base);
console.log('Durée d\'essai   : ' + jours + ' jour(s)');
if (debutActuel) {
  const reste = debutActuel + dureeMs - Date.now();
  console.log('Début actuel    : ' + fmt(debutActuel));
  console.log('État actuel     : ' + (reste > 0
    ? 'valide, ' + Math.floor(reste / 86400000) + ' j ' + Math.floor((reste % 86400000) / 3600000) + ' h restantes'
    : 'EXPIRÉ depuis ' + Math.floor(-reste / 3600000) + ' h'));
} else {
  console.log('État actuel     : aucune date enregistrée (essai non démarré)');
}

if (lectureSeule) {
  db.close();
  process.exit(0);
}

const maintenant = Date.now();
db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)')
  .run('first_install_date', String(maintenant));

// Trace dans le journal : une réactivation doit rester vérifiable.
try {
  db.prepare(`
    INSERT INTO audit_log
      (user_id, user_name, action, module, entity_type, severity, summary, changes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    null, 'maintenance', 'licence.reactivated', 'settings', 'app_config', 'warning',
    `Période d'essai réactivée pour ${jours} jour(s)`,
    JSON.stringify({
      first_install_date: {
        before: debutActuel ? new Date(debutActuel).toISOString() : null,
        after: new Date(maintenant).toISOString()
      },
      durationDays: jours
    }),
    new Date(maintenant).toISOString()
  );
} catch (e) {
  console.log('(journal non écrit : ' + e.message + ')');
}

db.close();

console.log('');
console.log('Licence réactivée.');
console.log('Nouveau début   : ' + fmt(maintenant));
console.log('Expire le       : ' + fmt(maintenant + dureeMs));
console.log('');
console.log("Redémarrez l'application : l'état d'essai est lu au démarrage.");
