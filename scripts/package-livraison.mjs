#!/usr/bin/env node
/**
 * Assemble le dossier de livraison client.
 *
 * Regroupe les exécutables produits par electron-builder, les manuels PDF et la
 * note de démarrage dans `livraison/Gestion-POS-<version>/`, puis vérifie que
 * rien ne manque. À exécuter après :
 *
 *     pnpm --filter @gestion-veloo/desktop package
 *     python docs/build_all.py
 *
 * Usage :  node scripts/package-livraison.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.join(ROOT, 'apps/desktop');
const RELEASE = path.join(DESKTOP, 'release');
const DOCS = path.join(ROOT, 'docs');

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const OUT = path.join(ROOT, 'livraison', `Gestion-POS-${VERSION}`);

const items = [
  { from: path.join(RELEASE, `Gestion-POS-Setup-${VERSION}.exe`), to: `Installation/Gestion-POS-Setup-${VERSION}.exe`, required: true },
  { from: path.join(RELEASE, `Gestion-POS-Portable-${VERSION}.exe`), to: `Installation/Gestion-POS-Portable-${VERSION}.exe`, required: true },
  { from: path.join(DOCS, 'Guide-Installation-et-Demarrage.pdf'), to: 'Documentation/Guide-Installation-et-Demarrage.pdf', required: true },
  { from: path.join(DOCS, 'Guide-Tests-et-Depannage.pdf'), to: 'Documentation/Guide-Tests-et-Depannage.pdf', required: true },
  { from: path.join(DOCS, 'LISEZ-MOI.txt'), to: 'LISEZ-MOI.txt', required: true }
];

const humanSize = bytes => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${(bytes / 1024).toFixed(0)} Ko`;
};

fs.rmSync(OUT, { recursive: true, force: true });

const missing = [];
const copied = [];

for (const item of items) {
  if (!fs.existsSync(item.from)) {
    if (item.required) missing.push(path.relative(ROOT, item.from));
    continue;
  }
  const target = path.join(OUT, item.to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(item.from, target);
  copied.push({ name: item.to, size: fs.statSync(target).size });
}

if (missing.length) {
  console.error('\nFichiers manquants — la livraison est incomplète :');
  for (const m of missing) console.error('  - ' + m);
  console.error('\nRelancez :');
  console.error('  pnpm --filter @gestion-veloo/desktop package');
  console.error('  python docs/build_all.py\n');
  process.exit(1);
}

// Empreintes SHA-256 : le client peut vérifier que les fichiers reçus sont intacts.
const { createHash } = await import('node:crypto');
const lines = [
  'Empreintes SHA-256 des fichiers livres',
  `Version ${VERSION} — ${new Date().toISOString().slice(0, 10)}`,
  '',
  'Verification sous Windows (PowerShell) :',
  '  Get-FileHash .\\Installation\\Gestion-POS-Setup-' + VERSION + '.exe -Algorithm SHA256',
  ''
];
for (const c of copied) {
  const hash = createHash('sha256').update(fs.readFileSync(path.join(OUT, c.name))).digest('hex');
  lines.push(`${hash}  ${c.name}`);
}
fs.writeFileSync(path.join(OUT, 'EMPREINTES-SHA256.txt'), lines.join('\r\n') + '\r\n');

console.log(`\nDossier de livraison prêt : ${path.relative(ROOT, OUT)}\n`);
for (const c of copied) {
  console.log(`  ${c.name.padEnd(56)} ${humanSize(c.size).padStart(9)}`);
}
console.log(`  ${'EMPREINTES-SHA256.txt'.padEnd(56)} ${humanSize(fs.statSync(path.join(OUT, 'EMPREINTES-SHA256.txt')).size).padStart(9)}`);

const total = copied.reduce((sum, c) => sum + c.size, 0);
console.log(`\n  Total : ${humanSize(total)}\n`);
