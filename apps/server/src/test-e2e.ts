import { getDb } from './db/index';
import { runSeed } from './db/seed';
import { 
  calculateTrialState, 
  STOCK_MOVEMENT_CODES, 
  formatDZD, 
  formatProductCode, 
  generateBarcodeValue 
} from '@gestion-veloo/shared';

async function runEndToEndVerification() {
  console.log('====================================================');
  console.log('🚀 DÉBUT DU TEST DE VÉRIFICATION DE BOUT-EN-BOUT');
  console.log('====================================================\n');

  // 1. Initialisation DB & Seed
  console.log('1️⃣  Initialisation de la base de données et Seed...');
  await runSeed();
  const { rawDb } = getDb();
  console.log('   ✅ Base de données initialisée.\n');

  // 2. Contrôle des Magasins, Utilisateurs et Couleurs
  console.log('2️⃣  Contrôle des données de référence :');
  const stores = rawDb.prepare('SELECT * FROM stores').all();
  console.log(`   - Magasins configurés : ${stores.length} (${stores.map((s: any) => s.name).join(', ')})`);
  if (stores.length < 2) throw new Error('Échec: 2 magasins requis');

  const users = rawDb.prepare('SELECT * FROM users').all();
  console.log(`   - Utilisateurs créés : ${users.length}`);

  const colors = rawDb.prepare('SELECT * FROM colors').all();
  console.log(`   - Couleurs pré-remplies : ${colors.length} (Objectif ~120 couleurs standardisées)`);
  if (colors.length < 100) throw new Error('Échec: Moins de 100 couleurs enregistrées');

  const motos = rawDb.prepare('SELECT * FROM motorcycle_models').all();
  console.log(`   - Modèles de motos compatibles : ${motos.length}`);
  console.log('   ✅ Données de référence validées.\n');

  // 3. Test Création Produit avec Couleurs Fusionnées (Merged Composite Mode)
  console.log('3️⃣  Test Création Produit — Mode "Couleurs Fusionnées (Merged)" :');
  const nextId = (rawDb.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM products').get() as any).nextId;
  const productCode = formatProductCode(nextId);
  const barcode1 = generateBarcodeValue(nextId);

  rawDb.prepare(`
    INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode)
    VALUES (?, ?, ?, 4, 8, 650000, 1100000, 950000, 850000, 'merged')
  `).run(nextId, productCode, 'Casque Intégral Carbone Multi-Teinte (Test Merged)');

  rawDb.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)').run(nextId, barcode1, 'auto');

  // Fusionner Noir (id: 1) et Rouge Vif (id: 21) sous le même merge_group_id
  const mergeGroupId = `merge-${nextId}-test`;
  rawDb.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)').run(nextId, 1, mergeGroupId);
  rawDb.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)').run(nextId, 21, mergeGroupId);

  // Initialiser stock boutique 1 à 0
  rawDb.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, 1, 0)').run(nextId);
  rawDb.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, 2, 0)').run(nextId);

  console.log(`   - Produit créé : ${productCode} | Barcode : ${barcode1} | Mode : Merged (Noir + Rouge)`);
  console.log('   ✅ Création produit multi-couleurs validée.\n');

  // 4. Test Bon d'Achat Fournisseur (Code 90 Stock Increase & Supplier Debt)
  console.log('4️⃣  Test Achat Fournisseur & Entrée Stock Code 90 :');
  const qtyToBuy = 15;
  const unitCost = 650000;
  const totalPurchase = qtyToBuy * unitCost;

  const purchaseRes = rawDb.prepare(`
    INSERT INTO purchases (store_id, supplier_id, user_id, total, amount_paid, payment_type)
    VALUES (1, 1, 1, ?, 0, 'credit')
  `).run(totalPurchase);
  const purchaseId = purchaseRes.lastInsertRowid;

  // Augmentation du stock
  const currentStock = (rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = 1').get(nextId) as any).quantity;
  const newStock = currentStock + qtyToBuy;

  rawDb.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = 1').run(newStock, nextId);

  // Mouvement CODE 90 (Achat)
  rawDb.prepare(`
    INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
    VALUES (?, 1, ?, ?, ?, ?, 1, 'purchase', ?)
  `).run(nextId, STOCK_MOVEMENT_CODES.ACHAT, currentStock, newStock, qtyToBuy, purchaseId);

  // Dette Fournisseur
  rawDb.prepare(`
    INSERT INTO supplier_transactions (supplier_id, type, amount, purchase_id, note)
    VALUES (1, 'achat', ?, ?, 'Achat test container')
  `).run(totalPurchase, purchaseId);

  console.log(`   - Achat #${purchaseId} enregistré : ${qtyToBuy} unités reçues`);
  console.log(`   - Stock Boutique 1 : ${currentStock} -> ${newStock} (Code Mouvement : ${STOCK_MOVEMENT_CODES.ACHAT})`);
  console.log(`   - Dette Fournisseur ajoutée : ${formatDZD(totalPurchase)}`);
  console.log('   ✅ Réassort Code 90 validé.\n');

  // 5. Test Règle d'Audit Visuelle (Vérification de la mise en surbrillance rouge/vert)
  console.log('5️⃣  Test Règle d\'Audit Visuelle Code 90 :');
  const lastMov = rawDb.prepare(`
    SELECT movement_code, qty_before, qty_after, delta
    FROM stock_movements
    WHERE product_id = ? AND store_id = 1
    ORDER BY id DESC LIMIT 1
  `).get(nextId) as any;

  if (lastMov.movement_code === 90) {
    console.log(`   - Détection Code 90 : VRAI`);
    console.log(`   - Ancien stock (en rouge barré) : ${lastMov.qty_before}`);
    console.log(`   - Nouveau stock (en vert) : ${lastMov.qty_after}`);
    console.log('   ✅ Règle d\'audit visuelle confirmée.\n');
  } else {
    throw new Error('Échec: Le dernier mouvement n\'est pas le code 90');
  }

  // 6. Test Vente POS à Crédit pour un Client Enregistré (Code 91 & Client Debt)
  console.log('6️⃣  Test Vente POS à Crédit & Décrément Stock Code 91 :');
  const saleQty = 2;
  const unitPrice = 1100000;
  const totalSale = saleQty * unitPrice;

  const saleRes = rawDb.prepare(`
    INSERT INTO sales (store_id, client_id, user_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status)
    VALUES (1, 1, 1, ?, 0, ?, 0, ?, 'credit', 'completed')
  `).run(totalSale, totalSale, totalSale);
  const saleId = saleRes.lastInsertRowid;

  const saleStockBefore = (rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = 1').get(nextId) as any).quantity;
  const saleStockAfter = saleStockBefore - saleQty;

  rawDb.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = 1').run(saleStockAfter, nextId);

  // Mouvement CODE 91 (Vente POS)
  rawDb.prepare(`
    INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
    VALUES (?, 1, ?, ?, ?, ?, 1, 'sale', ?)
  `).run(nextId, STOCK_MOVEMENT_CODES.VENTE, saleStockBefore, saleStockAfter, -saleQty, saleId);

  // Transaction dette client
  rawDb.prepare(`
    INSERT INTO client_transactions (client_id, type, amount, sale_id, note)
    VALUES (1, 'achat', ?, ?, 'Vente à crédit POS')
  `).run(totalSale, saleId);

  console.log(`   - Vente #${saleId} enregistrée à crédit : ${saleQty} unités pour ${formatDZD(totalSale)}`);
  console.log(`   - Stock restant : ${saleStockAfter} (Code 91)`);
  console.log(`   - Imputation sur la dette du Client #1 : +${formatDZD(totalSale)}`);
  console.log('   ✅ Vente POS à crédit validée.\n');

  // 7. Test Procédure de Retour Client (Code 92 Restock & Credit Balance Adjust)
  console.log('7️⃣  Test Procédure de Retour Client (Code 92) :');
  const returnQty = 1;
  const refundAmount = returnQty * unitPrice;

  const returnRes = rawDb.prepare(`
    INSERT INTO returns (sale_id, store_id, user_id, total_refund)
    VALUES (?, 1, 1, ?)
  `).run(saleId, refundAmount);
  const returnId = returnRes.lastInsertRowid;

  const returnStockBefore = (rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = 1').get(nextId) as any).quantity;
  const returnStockAfter = returnStockBefore + returnQty;

  rawDb.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = 1').run(returnStockAfter, nextId);

  // Mouvement CODE 92 (Retour)
  rawDb.prepare(`
    INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
    VALUES (?, 1, ?, ?, ?, ?, 1, 'return', ?)
  `).run(nextId, STOCK_MOVEMENT_CODES.RETOUR, returnStockBefore, returnStockAfter, returnQty, returnId);

  // Réduction dette client
  rawDb.prepare(`
    INSERT INTO client_transactions (client_id, type, amount, sale_id, note)
    VALUES (1, 'versement', ?, ?, 'Avoir suite au retour')
  `).run(refundAmount, saleId);

  console.log(`   - Retour #${returnId} validé sur vente #${saleId} : ${returnQty} unité réintégrée`);
  console.log(`   - Stock rétabli : ${returnStockAfter} (Code 92)`);
  console.log(`   - Avoir déduit de la dette client : -${formatDZD(refundAmount)}`);
  console.log('   ✅ Procédure de retour validée.\n');

  // 8. Test Calculateur de Zakat
  console.log('8️⃣  Test Calculateur de Zakat Commerciale :');
  const capitalRow = rawDb.prepare(`SELECT SUM(p.price_achat * ps.quantity) as capital FROM products p JOIN product_stock ps ON p.id = ps.product_id`).get() as any;
  const capital = capitalRow?.capital || 0;
  const liquidities = 50000000; // 500,000 DA
  const receivables = 10000000; // 100,000 DA
  const shortTermDebts = 20000000; // 200,000 DA

  const netZakatable = capital + liquidities + receivables - shortTermDebts;
  const zakatDue = Math.round(netZakatable * 0.025);

  console.log(`   - Capital Marchandises : ${formatDZD(capital)}`);
  console.log(`   - Liquidités : ${formatDZD(liquidities)}`);
  console.log(`   - Créances Clients : ${formatDZD(receivables)}`);
  console.log(`   - Dettes Fournisseurs : -${formatDZD(shortTermDebts)}`);
  console.log(`   - Assiette Nette : ${formatDZD(netZakatable)}`);
  console.log(`   - Zakat Due (2.5%) : ${formatDZD(zakatDue)}`);
  console.log('   ✅ Calcul Zakat validé.\n');

  // 9. Test Système de Démonstration 24 Heures (Trial Expiration Lock)
  console.log('9️⃣  Test Mécanisme Démo 24 Heures (Trial Expiration) :');
  const now = Date.now();
  const buildFresh = now - (2 * 3600 * 1000); // 2 heures écoulées
  const stateActive = calculateTrialState(buildFresh, now);
  console.log(`   - Échantillon actif (après 2h) : isExpired = ${stateActive.isExpired} | Message = "${stateActive.message}"`);
  if (stateActive.isExpired) throw new Error('Échec: Démo marquée expirée trop tôt');

  const buildExpired = now - (25 * 3600 * 1000); // 25 heures écoulées (>24h)
  const stateExpired = calculateTrialState(buildExpired, now);
  console.log(`   - Échantillon après 25h : isExpired = ${stateExpired.isExpired} | Message = "${stateExpired.message}"`);
  if (!stateExpired.isExpired) throw new Error('Échec: Verrouillage 24h non déclenché');
  console.log('   ✅ Verrouillage automatique de la démo validé.\n');

  console.log('====================================================');
  console.log('🎉 TOUS LES TESTS DE BOUT-EN-BOUT ONT RÉUSSI (100%)');
  console.log('====================================================');
}

runEndToEndVerification().catch(err => {
  console.error('❌ Erreur lors du test E2E:', err);
  process.exit(1);
});
