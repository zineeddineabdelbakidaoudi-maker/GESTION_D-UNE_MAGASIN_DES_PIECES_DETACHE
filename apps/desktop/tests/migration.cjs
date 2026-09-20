/* Verifie la migration d'une base EXISTANTE (copie de la base reelle du magasin). */
const path = require('path');
const Module = require('module');

const ROOT = process.env.GV_ROOT || path.resolve(__dirname, '../../..');
const BUILD = process.env.GV_BUILD;
const DATA_DIR = process.env.GV_DATA;

const handlers = new Map();
const fakeElectron = {
  app: { getPath: () => DATA_DIR },
  ipcMain: { handle: (c, f) => handlers.set(c, f), eventNames: () => [...handlers.keys()] }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  if (request === 'better-sqlite3') return origLoad.call(this, path.join(ROOT, 'apps/desktop/node_modules/better-sqlite3'), parent, isMain);
  if (request === 'bcryptjs') return origLoad.call(this, path.join(ROOT, 'apps/desktop/node_modules/bcryptjs'), parent, isMain);
  if (request === 'bwip-js') return { toBuffer: async () => Buffer.from('') };
  if (request === '@gestion-veloo/shared') return origLoad.call(this, path.join(ROOT, 'packages/shared/dist/index.js'), parent, isMain);
  return origLoad.apply(this, arguments);
};

const sqlite = require(path.join(ROOT, 'apps/desktop/node_modules/better-sqlite3'));
const DBPATH = path.join(DATA_DIR, 'pos_local.sqlite');

const snap = (db) => ({
  products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
  sales: db.prepare('SELECT COUNT(*) c FROM sales').get().c,
  saleItems: db.prepare('SELECT COUNT(*) c FROM sale_items').get().c,
  purchases: db.prepare('SELECT COUNT(*) c FROM purchases').get().c,
  clients: db.prepare('SELECT COUNT(*) c FROM clients').get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  stockUnits: db.prepare('SELECT COALESCE(SUM(quantity),0) c FROM product_stock').get().c,
  movements: db.prepare('SELECT COUNT(*) c FROM stock_movements').get().c
});

let before;
{
  const db = sqlite(DBPATH);
  before = snap(db);
  console.log('AVANT migration :', JSON.stringify(before));
  console.log('user_version avant :', db.pragma('user_version', { simple: true }));
  db.close();
}

const { getLocalDb } = require(path.join(BUILD, 'db.js'));
const db = getLocalDb();

const after = snap(db);
console.log('APRES migration :', JSON.stringify(after));
console.log('user_version apres :', db.pragma('user_version', { simple: true }));

let pass = 0, fail = 0;
const check = (label, a, e) => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + label + ': ' + JSON.stringify(a) + (ok ? '' : ' (attendu ' + JSON.stringify(e) + ')'));
  ok ? pass++ : fail++;
};

console.log('\n---- Integrite des donnees existantes');
for (const k of Object.keys(before)) check('aucune perte : ' + k, after[k], before[k]);

console.log('\n---- Nouvelles structures');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
['audit_log', 'product_cost_history', 'login_attempts'].forEach(t => check('table ' + t, tables.includes(t), true));

const cols = (t) => db.prepare('PRAGMA table_info(' + t + ')').all().map(r => r.name);
check('users.locked_until', cols('users').includes('locked_until'), true);
check('users.must_change_password', cols('users').includes('must_change_password'), true);
check('products.min_stock', cols('products').includes('min_stock'), true);
check('settings.cost_threshold', cols('settings').includes('cost_threshold'), true);
check('purchase_items.cost_strategy', cols('purchase_items').includes('cost_strategy'), true);
check('return_items.unit_cost_snapshot', cols('return_items').includes('unit_cost_snapshot'), true);
check('stock_movements.unit_cost', cols('stock_movements').includes('unit_cost'), true);

console.log('\n---- Permissions retablies pour chaque compte');
const users = db.prepare('SELECT id, username, role FROM users').all();
for (const u of users) {
  const n = db.prepare('SELECT COUNT(*) c FROM permissions WHERE user_id=?').get(u.id).c;
  check('permissions de @' + u.username + ' (' + u.role + ')', n >= 12, true);
  const journal = db.prepare("SELECT COUNT(*) c FROM permissions WHERE user_id=? AND module='journal'").get(u.id).c;
  check('module journal present pour @' + u.username, journal, 1);
}
const dupes = db.prepare('SELECT COUNT(*) c FROM (SELECT user_id, module FROM permissions GROUP BY user_id, module HAVING COUNT(*) > 1)').get().c;
check('aucun doublon de permission', dupes, 0);

console.log('\n---- Coherence comptable');
const zeroCost = db.prepare('SELECT COUNT(*) c FROM sale_items WHERE unit_cost_snapshot = 0').get().c;
console.log('  lignes de vente encore sans cout de revient : ' + zeroCost + ' (articles a prix achat nul)');
const negStock = db.prepare('SELECT COUNT(*) c FROM product_stock WHERE quantity < 0').get().c;
check('aucun stock negatif', negStock, 0);

console.log('\n---- Rejouabilite (2e passage)');
db.close();
delete require.cache[require.resolve(path.join(BUILD, 'db.js'))];
const { getLocalDb: again } = require(path.join(BUILD, 'db.js'));
const db2 = again();
const after2 = snap(db2);
check('idempotent : totaux inchanges', after2, after);

console.log('\n' + pass + ' verifications reussies, ' + fail + ' echouees');
process.exit(fail ? 1 : 0);
