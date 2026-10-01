/* Harnais d'integration : pilote les VRAIS handlers IPC du process principal. */
const path = require('path');
const Module = require('module');

const ROOT = process.env.GV_ROOT || path.resolve(__dirname, '../../..');
const BUILD = process.env.GV_BUILD;
const DATA_DIR = process.env.GV_DATA;

const handlers = new Map();
const fakeElectron = {
  app: { getPath: () => DATA_DIR },
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    eventNames: () => [...handlers.keys()]
  }
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

const { registerIpcHandlers } = require(path.join(BUILD, 'ipc.js'));
registerIpcHandlers();

const EVENT = { sender: { id: 1, getPrintersAsync: async () => [] } };
const call = (channel, payload) => {
  const fn = handlers.get(channel);
  if (!fn) throw new Error('canal absent: ' + channel);
  return fn(EVENT, payload);
};

const DB = require(path.join(ROOT, 'apps/desktop/node_modules/better-sqlite3'))(path.join(DATA_DIR, 'pos_local.sqlite'));
const money = (c) => (c / 100).toFixed(2) + ' DA';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + label + ': ' + JSON.stringify(actual) + (ok ? '' : ' (attendu ' + JSON.stringify(expected) + ')'));
  ok ? pass++ : fail++;
}
function section(t) { console.log('\n---- ' + t); }

const stockOf = (pid, sid) => {
  const row = DB.prepare('SELECT quantity q FROM product_stock WHERE product_id=? AND store_id=?').get(pid, sid);
  return row ? row.q : 0;
};
const costOf = (pid) => DB.prepare('SELECT price_achat c FROM products WHERE id=?').get(pid).c;

(async () => {
  section('Authentification & permissions');
  try { await call('get-products', {}); check('appel sans session refuse', 'non refuse', 'refuse'); }
  catch (e) { check('appel sans session refuse', e.message.startsWith('AUTH_REQUIRED'), true); }

  try { await call('auth-login', { username: 'admin', password: 'mauvais' }); check('mot de passe faux rejete', 'accepte', 'rejete'); }
  catch (e) { check('mot de passe faux rejete', e.message.includes('INVALID_CREDENTIALS'), true); }

  const login = await call('auth-login', { username: 'admin', password: 'admin123' });
  check('connexion proprietaire', login.user.role, 'owner');
  check('couts visibles pour le proprietaire', login.capabilities.canSeeCost, true);

  section('Regle du prix achat -- stock eleve (mediane attendue)');
  const supplierId = DB.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get().id;
  const STORE = 1;
  const pHigh = await call('create-product', {
    name: 'TEST PLAQUETTE STOCK HAUT', priceAchat: 10000, priceDetail: 20000, priceSemiGros: 18000, priceGros: 16000,
    colorMode: 'single', initialStock: { '1': 40 }
  });
  check('stock initial', stockOf(pHigh.id, STORE), 40);
  check('cout initial', costOf(pHigh.id), 10000);

  const purHigh = await call('create-purchase', {
    storeId: STORE, supplierId, paymentType: 'cash', amountPaid: 160000,
    items: [{ productId: pHigh.id, qty: 10, unitCost: 16000 }]
  });
  check('stock apres achat (40 + 10)', stockOf(pHigh.id, STORE), 50);
  check('strategie appliquee', purHigh.costReport[0].strategy, 'median');
  check('nouveau cout = mediane (100 + 160) / 2', costOf(pHigh.id), 13000);

  section('Regle du prix achat -- stock bas (nouveau prix dominant)');
  const pLow = await call('create-product', {
    name: 'TEST CABLE STOCK BAS', priceAchat: 10000, priceDetail: 20000, priceSemiGros: 18000, priceGros: 16000,
    colorMode: 'single', initialStock: { '1': 3 }
  });
  const purLow = await call('create-purchase', {
    storeId: STORE, supplierId, paymentType: 'credit', amountPaid: 0,
    items: [{ productId: pLow.id, qty: 20, unitCost: 16000 }]
  });
  check('stock apres achat (3 + 20)', stockOf(pLow.id, STORE), 23);
  check('strategie appliquee', purLow.costReport[0].strategy, 'dominant');
  check('nouveau cout = prix entrant', costOf(pLow.id), 16000);
  check('dette fournisseur creee', DB.prepare('SELECT amount a FROM supplier_transactions WHERE purchase_id=?').get(purLow.purchaseId).a, 320000);

  section('Vente : stock decremente, cout fige, benefice');
  const sale = await call('create-sale', {
    storeId: STORE, paymentType: 'cash', amountPaid: 0, discount: 0,
    items: [{ productId: pLow.id, qty: 5, unitPrice: 20000, priceTier: 'detail' }]
  });
  check('stock apres vente (23 - 5)', stockOf(pLow.id, STORE), 18);
  check('total vente', sale.total, 100000);
  check('marge = (200 - 160) x 5', sale.margin, 20000);

  section('Stock insuffisant refuse');
  try {
    await call('create-sale', { storeId: STORE, paymentType: 'cash', items: [{ productId: pLow.id, qty: 9999, unitPrice: 20000 }] });
    check('vente au-dela du stock', 'acceptee', 'refusee');
  } catch (e) { check('vente au-dela du stock refusee', e.message.includes('Stock insuffisant'), true); }

  section('Retour : stock reintegre, statut partiel puis total');
  const saleRows = await call('get-sales', { storeId: STORE, saleId: sale.saleId });
  const lineId = saleRows[0].items[0].id;
  const ret = await call('process-return', {
    saleId: sale.saleId, items: [{ saleItemId: lineId, qtyReturned: 2 }], reason: 'Piece non conforme (test)'
  });
  check('stock apres retour (18 + 2)', stockOf(pLow.id, STORE), 20);
  check('remboursement = 2 x 200', ret.totalRefund, 40000);
  check('statut partiel', ret.status, 'partial_return');

  try {
    await call('process-return', { saleId: sale.saleId, items: [{ saleItemId: lineId, qtyReturned: 99 }], reason: 'test exces' });
    check('retour au-dela du vendu', 'accepte', 'refuse');
  } catch (e) { check('retour au-dela du vendu refuse', e.message.includes('Retour impossible'), true); }

  const ret2 = await call('process-return', {
    saleId: sale.saleId, items: [{ saleItemId: lineId, qtyReturned: 3 }], reason: 'Solde du retour (test)'
  });
  check('stock apres retour total (20 + 3)', stockOf(pLow.id, STORE), 23);
  check('statut totalement retourne', ret2.status, 'returned');

  section('Ajustement de stock');
  try {
    await call('adjust-stock', { productId: pLow.id, storeId: STORE, newQuantity: 30 });
    check('ajustement sans motif', 'accepte', 'refuse');
  } catch (e) { check('ajustement sans motif refuse', e.message.includes('motif'), true); }
  await call('adjust-stock', { productId: pLow.id, storeId: STORE, newQuantity: 30, note: 'Inventaire physique (test)' });
  check('stock apres ajustement', stockOf(pLow.id, STORE), 30);

  section('Categories de depenses');
  const catsBefore = await call('get-expense-categories', {});
  const newCat = await call('add-expense-category', 'TEST CATEGORIE JETABLE');
  check('categorie ajoutee', typeof newCat.id === 'number', true);

  try {
    await call('add-expense-category', 'TEST CATEGORIE JETABLE');
    check('doublon de categorie', 'accepte', 'refuse');
  } catch (e) { check('doublon de categorie refuse', e.message.includes('existe'), true); }

  await call('delete-expense-category', { id: newCat.id });
  const catsAfter = await call('get-expense-categories', {});
  check('categorie supprimee', catsAfter.length, catsBefore.length);

  const usedCat = await call('add-expense-category', 'TEST CATEGORIE UTILISEE');
  await call('create-depense', { storeId: STORE, categoryId: usedCat.id, amount: 50000, note: 'test' });
  try {
    await call('delete-expense-category', { id: usedCat.id });
    check('suppression d une categorie utilisee', 'acceptee', 'refusee');
  } catch (e) { check('suppression d une categorie utilisee refusee', e.message.includes('utilisent encore'), true); }

  section('Forme des depenses renvoyees a l ecran');
  const listeDep = await call('get-depenses', { storeId: STORE });
  const dep = listeDep[0];
  check('date exploitable par l interface', Number.isFinite(Date.parse(dep.depenseDate)), true);
  check('categorie identifiee', typeof dep.categoryId, 'number');
  check('libelle de categorie present', typeof dep.categoryName, 'string');

  section('Tri du catalogue');
  const catalogue = await call('get-products', {});
  const ids = catalogue.map(p => p.id);
  const croissant = ids.every((v, i) => i === 0 || ids[i - 1] <= v);
  check('articles tries par identifiant croissant', croissant, true);
  check('premier article = plus petit identifiant', ids[0], Math.min(...ids));

  const stock = await call('get-stock', { storeId: STORE });
  const stockIds = stock.map(r => r.productId);
  check('stock trie par identifiant croissant', stockIds.every((v, i) => i === 0 || stockIds[i - 1] <= v), true);

  section('Journal audit');
  const journal = await call('get-audit-log', { limit: 300 });
  const actions = journal.entries.map(e => e.action);
  ['auth.login.success', 'auth.login.failed', 'product.created', 'purchase.created', 'product.cost.recalculated', 'sale.created', 'return.created', 'stock.adjusted'].forEach(a => {
    check('action journalisee ' + a, actions.includes(a), true);
  });
  const costEntry = journal.entries.find(e => e.action === 'product.cost.recalculated' && e.entityId === pLow.id);
  check('avant/apres du cout trace', costEntry.changes[0], { field: 'price_achat', label: "Prix d'achat", before: 10000, after: 16000 });

  section('Cloisonnement par role (caissier)');
  const cashier = await call('auth-login', { username: 'vendeur1', password: 'vendeur123' });
  check('role', cashier.user.role, 'cashier');
  check('couts masques', cashier.capabilities.canSeeCost, false);
  const prodsAsCashier = await call('get-products', {});
  check('prix achat masque dans le catalogue', prodsAsCashier[0].priceAchat, null);
  for (const [channel, payload] of [['get-audit-log', {}], ['get-users', {}], ['create-purchase', { supplierId, items: [] }], ['get-reports', {}]]) {
    try { await call(channel, payload); check(channel + ' refuse au caissier', 'autorise', 'refuse'); }
    catch (e) { check(channel + ' refuse au caissier', e.message.includes('FORBIDDEN'), true); }
  }

  await call('auth-login', { username: 'admin', password: 'admin123' });
  const denials = await call('get-audit-log', { action: 'access.denied' });
  check('refus acces journalises', denials.total >= 4, true);

  section('Rapports');
  const rep = await call('get-reports', { storeId: STORE, period: 'day' });
  console.log('  CA net ' + money(rep.totalCA) + ' | benefice brut ' + money(rep.totalBeneficesBrut) +
    ' | depenses ' + money(rep.totalDepenses) + ' | benefice net ' + money(rep.totalBenefices) +
    ' | valeur stock ' + money(rep.stockValue));
  check('marge annulee apres retour total', rep.totalBeneficesBrut, 0);
  check('CA net ramene a zero apres retour total', rep.totalCA, 0);

  // ---------------------------------------------------------------------
  section('Stock par couleur');

  const couleurs = DB.prepare('SELECT id, name FROM colors ORDER BY id LIMIT 3').all();
  const [rouge, bleu, vert] = couleurs;

  const multi = await call('create-product', {
    name: 'CARENAGE MULTICOLORE',
    priceAchat: 100000, priceDetail: 160000, priceSemiGros: 140000, priceGros: 120000,
    colorMode: 'variants',
    colorIds: [rouge.id, bleu.id, vert.id],
    colorStock: {
      [String(rouge.id)]: { '1': 7 },
      [String(bleu.id)]: { '1': 3 },
      [String(vert.id)]: { '1': 0 }
    },
    // Quantite globale envoyee expres : elle doit etre ignoree.
    initialStock: { '1': 999 }
  });

  const fiche = (await call('get-products', { q: 'CARENAGE MULTICOLORE', storeId: STORE }))[0];
  check('total calcule depuis les couleurs', fiche.totalStock, 10);
  check('quantite globale envoyee ignoree', fiche.totalStock !== 999, true);
  check('article marque comme suivi par couleur', fiche.colorStockTracked, true);
  const parNom = Object.fromEntries(fiche.colors.map(c => [c.name, c.stock]));
  check('stock de la couleur 1', parNom[rouge.name], 7);
  check('stock de la couleur 2', parNom[bleu.name], 3);
  check('stock de la couleur 3', parNom[vert.name], 0);

  const ligneRouge = fiche.colors.find(c => c.name === rouge.name).id;
  const ligneVert = fiche.colors.find(c => c.name === vert.name).id;

  try {
    await call('create-sale', { storeId: STORE, items: [{ productId: multi.id, qty: 1, unitPrice: 160000 }] });
    check('vente sans couleur refusee', 'acceptee', 'refusee');
  } catch (e) {
    check('vente sans couleur refusee', /couleur/i.test(e.message), true);
  }

  try {
    await call('create-sale', {
      storeId: STORE,
      items: [{ productId: multi.id, qty: 1, unitPrice: 160000, productColorId: ligneVert }]
    });
    check('vente d une couleur epuisee refusee', 'acceptee', 'refusee');
  } catch (e) {
    check('vente d une couleur epuisee refusee', /insuffisant/i.test(e.message), true);
  }

  await call('create-sale', {
    storeId: STORE,
    items: [{ productId: multi.id, qty: 2, unitPrice: 160000, productColorId: ligneRouge }]
  });
  const apresVente = (await call('get-products', { q: 'CARENAGE MULTICOLORE', storeId: STORE }))[0];
  check('couleur vendue decrementee', apresVente.colors.find(c => c.name === rouge.name).stock, 5);
  check('autre couleur intacte', apresVente.colors.find(c => c.name === bleu.name).stock, 3);
  check('total = somme des couleurs apres vente', apresVente.totalStock, 8);
  check(
    'total egal a la somme detaillee',
    apresVente.colors.reduce((acc, c) => acc + c.stock, 0),
    apresVente.totalStock
  );

  try {
    await call('adjust-stock', { productId: multi.id, storeId: STORE, newQuantity: 50, note: 'test' });
    check('ajustement global refuse sur article suivi par couleur', 'accepte', 'refuse');
  } catch (e) {
    check('ajustement global refuse sur article suivi par couleur', /couleur par couleur/i.test(e.message), true);
  }

  try {
    await call('create-purchase', {
      storeId: STORE, supplierId,
      items: [{ productId: multi.id, qty: 5, unitCost: 100000 }]
    });
    check('achat sans couleur refuse', 'accepte', 'refuse');
  } catch (e) {
    check('achat sans couleur refuse', /couleur/i.test(e.message), true);
  }

  await call('create-purchase', {
    storeId: STORE, supplierId,
    items: [{ productId: multi.id, qty: 5, unitCost: 100000, productColorId: ligneVert }]
  });
  const apresAchat = (await call('get-products', { q: 'CARENAGE MULTICOLORE', storeId: STORE }))[0];
  check('couleur recue creditee', apresAchat.colors.find(c => c.name === vert.name).stock, 5);
  check(
    'total toujours egal a la somme des couleurs apres achat',
    apresAchat.colors.reduce((acc, c) => acc + c.stock, 0),
    apresAchat.totalStock
  );

  // ---------------------------------------------------------------------
  section('Prix plancher : jamais sous le prix d achat');

  const pPlancher = await call('create-product', {
    name: 'ARTICLE PLANCHER', priceAchat: 50000, priceDetail: 80000,
    initialStock: { '1': 20 }
  });

  try {
    await call('create-sale', {
      storeId: STORE,
      items: [{ productId: pPlancher.id, qty: 1, unitPrice: 49900 }]
    });
    check('prix unitaire sous le cout refuse', 'accepte', 'refuse');
  } catch (e) {
    check('prix unitaire sous le cout refuse', /perte/i.test(e.message), true);
  }

  const auCout = await call('create-sale', {
    storeId: STORE,
    items: [{ productId: pPlancher.id, qty: 1, unitPrice: 50000 }]
  });
  check('vente exactement au prix d achat acceptee', auCout.saleId > 0, true);

  try {
    await call('create-sale', {
      storeId: STORE,
      items: [{ productId: pPlancher.id, qty: 2, unitPrice: 80000 }],
      discount: 70000
    });
    check('remise sous le cout refusee', 'acceptee', 'refusee');
  } catch (e) {
    check('remise sous le cout refusee', /Remise refusee/i.test(e.message), true);
  }

  const avecRemise = await call('create-sale', {
    storeId: STORE,
    items: [{ productId: pPlancher.id, qty: 2, unitPrice: 80000 }],
    discount: 60000
  });
  check('remise laissant la vente au cout acceptee', avecRemise.saleId > 0, true);

  console.log('\n' + pass + ' verifications reussies, ' + fail + ' echouees');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR HARNAIS:', e); process.exit(1); });
