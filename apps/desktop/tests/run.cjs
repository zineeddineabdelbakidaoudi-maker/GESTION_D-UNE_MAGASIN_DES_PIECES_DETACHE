#!/usr/bin/env node
/**
 * Lanceur des tests d'intégration du process principal.
 *
 * `better-sqlite3` est un module natif compilé pour l'ABI d'Electron : il ne peut
 * pas être chargé par le Node du système. Ce script relance donc les suites à
 * travers le binaire Electron en mode Node (ELECTRON_RUN_AS_NODE), après avoir
 * compilé `electron/*.ts` en CommonJS dans un dossier temporaire.
 *
 * Usage :  node tests/run.cjs  [--keep]
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-tests-'));
const BUILD = path.join(TMP, 'build');

function findElectron() {
  const candidates = [
    path.join(ROOT, 'node_modules/electron/dist/electron.exe'),
    path.join(DESKTOP, 'node_modules/electron/dist/electron.exe'),
    path.join(ROOT, 'node_modules/electron/dist/electron'),
    path.join(DESKTOP, 'release/win-unpacked/Gestion Pièces Cycles & Motos POS.exe')
  ];
  return candidates.find(p => fs.existsSync(p));
}

const electron = findElectron();
if (!electron) {
  console.error(
    "Runtime Electron introuvable.\n" +
    "Installez les dépendances (pnpm install) ou construisez l'application une fois (pnpm build:desktop)."
  );
  process.exit(1);
}

// On invoque directement le point d'entrée JS de TypeScript : les wrappers .CMD
// de npm/pnpm ne sont pas exécutables via spawn sans shell sous Windows.
const TSC = require.resolve('typescript/bin/tsc', { paths: [ROOT, DESKTOP] });

console.log('→ Compilation du package partagé…');
execFileSync(process.execPath, [TSC], {
  cwd: path.join(ROOT, 'packages/shared'),
  stdio: 'inherit'
});

console.log('→ Compilation du process principal en CommonJS…');
execFileSync(
  process.execPath,
  [
    TSC,
    'electron/db.ts', 'electron/ipc.ts', 'electron/session.ts', 'electron/audit.ts', 'electron/printer.ts',
    '--module', 'commonjs', '--target', 'ES2020', '--outDir', BUILD,
    '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node', '--strict', 'false'
  ],
  { cwd: DESKTOP, stdio: 'inherit' }
);

const suites = [
  { name: 'Règles métier (bout en bout)', file: 'e2e-business-rules.cjs', fresh: true },
  { name: 'Migration de base existante', file: 'migration.cjs', fresh: false }
];

let failed = 0;
for (const suite of suites) {
  const dataDir = path.join(TMP, 'data-' + path.basename(suite.file, '.cjs'));
  fs.mkdirSync(dataDir, { recursive: true });

  if (!suite.fresh) {
    // La suite de migration a besoin d'une base au format précédent :
    // on part de la base réelle du poste si elle existe.
    const live = path.join(process.env.APPDATA || os.homedir(), '@gestion-veloo/desktop/pos_local.sqlite');
    if (!fs.existsSync(live)) {
      console.log(`\n⚠ ${suite.name} ignorée : aucune base installée sur ce poste.`);
      continue;
    }
    fs.copyFileSync(live, path.join(dataDir, 'pos_local.sqlite'));
  }

  console.log(`\n══ ${suite.name} ══`);
  const res = spawnSync(electron, [path.join(__dirname, suite.file)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GV_BUILD: BUILD, GV_DATA: dataDir, GV_ROOT: ROOT }
  });
  if (res.status !== 0) failed++;
}

if (!process.argv.includes('--keep')) {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} suite(s) en échec.` : '\nToutes les suites sont au vert.');
process.exit(failed ? 1 : 0);
