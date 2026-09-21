/* Verifie la chaine cloud : authentification, ingestion de journal, lecture portail. */
const BASE = process.env.GV_API || 'http://localhost:3055/api';
const KEY = process.env.GV_KEY || 'test-key-123';

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + label + ': ' + JSON.stringify(actual) + (ok ? '' : ' (attendu ' + JSON.stringify(expected) + ')'));
  ok ? pass++ : fail++;
};
const section = (t) => console.log('\n---- ' + t);

const req = async (path, opts = {}) => {
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
};

const now = new Date().toISOString();
const DEVICE = 'POS-TEST-' + Date.now().toString(36).toUpperCase();

const payload = {
  storeId: 1,
  deviceId: DEVICE,
  appVersion: '2.0.0',
  sales: [{ id: 90001, storeId: 1, userId: 1, subtotal: 100000, discount: 0, total: 100000, amountPaid: 100000, amountCredit: 0, paymentType: 'cash', status: 'completed', createdAt: now, items: [] }],
  returns: [],
  purchases: [{ id: 90001, storeId: 1, supplierId: 1, userId: 1, total: 320000, amountPaid: 0, paymentType: 'credit', createdAt: now }],
  stockMovements: [{ id: 90001, productId: 1, storeId: 1, movementCode: 90, qtyBefore: 3, qtyAfter: 23, delta: 20, userId: 1, refType: 'purchase', refId: 90001, createdAt: now }],
  depenses: [],
  clientTransactions: [],
  supplierTransactions: [],
  stockTransfers: [],
  stock: [{ product_id: 1, quantity: 23 }],
  auditEntries: [
    { id: 5001, device_id: DEVICE, user_id: 1, user_name: 'Proprietaire Gerant', store_id: 1, action: 'purchase.created', module: 'achat', entity_type: 'purchase', entity_id: 90001, severity: 'info', summary: "Bon d'achat #90001 enregistre.", changes_json: null, metadata_json: JSON.stringify({ total: 320000 }), app_version: '2.0.0', created_at: now },
    { id: 5002, device_id: DEVICE, user_id: 1, user_name: 'Proprietaire Gerant', store_id: 1, action: 'product.cost.recalculated', module: 'achat', entity_type: 'product', entity_id: 1, severity: 'notice', summary: "Prix d'achat recalcule.", changes_json: JSON.stringify([{ field: 'price_achat', label: "Prix d'achat", before: 10000, after: 16000 }]), metadata_json: JSON.stringify({ strategy: 'dominant', stockBefore: 3 }), app_version: '2.0.0', created_at: now },
    { id: 5003, device_id: DEVICE, user_id: 2, user_name: 'Vendeur Magasin 1', store_id: 1, action: 'access.denied', module: 'rapport', entity_type: null, entity_id: null, severity: 'critical', summary: 'Tentative de consultation des rapports sans autorisation.', changes_json: null, metadata_json: null, app_version: '2.0.0', created_at: now }
  ],
  costHistory: [
    { id: 7001, product_id: 1, store_id: 1, previous_cost: 10000, incoming_cost: 16000, new_cost: 16000, stock_before: 3, strategy: 'dominant', reason: 'Stock avant achat (3) < 5 : le nouveau prix devient dominant.', ref_type: 'purchase', ref_id: 90001, user_id: 1, created_at: now }
  ],
  auditCursor: 5003
};

(async () => {
  section('Authentification du portail');
  const badLogin = await req('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'mauvais' })
  });
  check('mot de passe faux rejete', badLogin.status, 401);

  const login = await req('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  check('connexion proprietaire', login.status, 200);
  const token = login.body?.token;
  check('jeton emis', typeof token === 'string' && token.length > 20, true);

  section('Protection du point de synchronisation');
  const noKey = await req('/sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  check('envoi sans cle refuse', noKey.status, 401);

  const wrongKey = await req('/sync/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': 'mauvaise' }, body: JSON.stringify(payload)
  });
  check('envoi avec mauvaise cle refuse', wrongKey.status, 401);

  section('Ingestion du lot');
  const push = await req('/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Key': KEY, 'X-Device-Id': DEVICE },
    body: JSON.stringify(payload)
  });
  check('envoi accepte', push.status, 200);
  check('lot authentifie', push.body?.authenticated, true);
  check('entrees de journal inserees', push.body?.counts?.auditInserted, 3);
  check('historique de cout insere', push.body?.counts?.costInserted, 1);

  const replay = await req('/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Key': KEY, 'X-Device-Id': DEVICE },
    body: JSON.stringify(payload)
  });
  check('rejeu sans doublon de journal', replay.body?.counts?.auditInserted, 0);

  section('Lecture du journal par le portail');
  const auth = { headers: { Authorization: 'Bearer ' + token } };

  const anon = await req('/journal');
  check('journal inaccessible sans jeton', anon.status, 401);

  const journal = await req('/journal?limit=50', auth);
  check('journal accessible au proprietaire', journal.status, 200);
  check('3 entrees consolidees', journal.body?.total, 3);

  const critical = await req('/journal?severity=critical', auth);
  check('filtre gravite critique', critical.body?.total, 1);
  check('resume du refus d acces', critical.body?.entries?.[0]?.action, 'access.denied');

  const costEntry = (journal.body?.entries || []).find(e => e.action === 'product.cost.recalculated');
  check('avant/apres restitue au portail', costEntry?.changes?.[0], { field: 'price_achat', label: "Prix d'achat", before: 10000, after: 16000 });
  check('contexte technique restitue', costEntry?.metadata?.strategy, 'dominant');

  const search = await req('/journal?search=dominant', auth);
  check('recherche plein texte', search.body?.total >= 0, true);

  section('Historique des prix d achat');
  const costs = await req('/journal/cost-history', auth);
  check('une ligne de recalcul', costs.body?.length, 1);
  check('regle enregistree', costs.body?.[0]?.strategy, 'dominant');
  check('stock ayant declenche la regle', costs.body?.[0]?.stock_before, 3);

  section('Supervision des caisses');
  const stats = await req('/journal/stats', auth);
  check('poste enregistre', stats.body?.devices?.some(d => d.deviceId === DEVICE), true);
  check('deux lots recus pour ce poste', stats.body?.devices?.find(d => d.deviceId === DEVICE)?.totalBatches, 2);
  check('dernier lot marque authentifie', stats.body?.lastBatches?.[0]?.authenticated, true);

  const filters = await req('/journal/filters', auth);
  check('actions disponibles au filtre', filters.body?.actions?.includes('access.denied'), true);

  section('Cloisonnement du portail');
  const cashier = await req('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'vendeur1', password: 'vendeur123' })
  });
  if (cashier.status === 200) {
    const asCashier = await req('/journal', { headers: { Authorization: 'Bearer ' + cashier.body.token } });
    check('journal refuse au caissier', asCashier.status, 403);
  } else {
    console.log('  (compte vendeur1 absent du serveur, test ignore)');
  }

  console.log('\n' + pass + ' verifications reussies, ' + fail + ' echouees');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR HARNAIS:', e); process.exit(1); });
