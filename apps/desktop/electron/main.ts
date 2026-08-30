import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
// @ts-ignore
import bwipjs from 'bwip-js';
import { getLocalDb } from './db';
import { formatThermalReceiptText } from './printer';
import { calculateTrialState } from '@gestion-veloo/shared';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';
import { formatProductCode, generateBarcodeValue } from '@gestion-veloo/shared';

// Baked build timestamp
const BUILD_TIME = process.env.BUILD_TIME ? parseInt(process.env.BUILD_TIME, 10) : Date.now();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Gestion POS — Pièces Cycles & Motos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  const db = getLocalDb();

  // 1. Trial Status
  ipcMain.handle('get-trial-status', () => {
    return calculateTrialState(BUILD_TIME);
  });

  // 2. Barcode Generator
  ipcMain.handle('generate-barcode-image', async (_event, text: string) => {
    try {
      const pngBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: text,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center'
      });
      return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    } catch (err: any) {
      throw new Error(`Erreur génération code-barres: ${err.message}`);
    }
  });

  // 3. Print Thermal Receipt
  ipcMain.handle('print-receipt', async (_event, payload: any) => {
    try {
      const receiptText = formatThermalReceiptText(payload);
      console.log('--- THERMAL RECEIPT 80MM (ESC/POS) ---');
      console.log(receiptText);
      return { success: true, receiptText };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 4. Products Search & CRUD
  ipcMain.handle('get-products', (_event, params: { q?: string; categoryId?: number; colorId?: number; storeId?: number; sort?: string }) => {
    const { q, categoryId, colorId, storeId, sort } = params || {};
    let sql = `
      SELECT DISTINCT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN product_barcodes pb ON p.id = pb.product_id
      LEFT JOIN product_motorcycle_compat pmc ON p.id = pmc.product_id
      LEFT JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id
      LEFT JOIN product_colors pc ON p.id = pc.product_id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];

    if (q) {
      sql += ` AND (LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(pb.barcode_value) LIKE ? OR LOWER(b.name) LIKE ? OR LOWER(mm.name) LIKE ?)`;
      const like = `%${q.toLowerCase()}%`;
      sqlParams.push(like, like, like, like, like);
    }
    if (categoryId) {
      sql += ` AND p.category_id = ?`;
      sqlParams.push(categoryId);
    }
    if (colorId) {
      sql += ` AND pc.color_id = ?`;
      sqlParams.push(colorId);
    }
    sql += ` ORDER BY ${sort === 'az' ? 'p.name ASC' : 'p.id DESC'}`;

    const rawProducts = db.prepare(sql).all(...sqlParams) as any[];

    return rawProducts.map(p => {
      const barcodes = db.prepare('SELECT id, barcode_value as barcodeValue, source FROM product_barcodes WHERE product_id = ?').all(p.id);
      const colors = db.prepare(`
        SELECT pc.id, pc.color_id as colorId, pc.merge_group_id as mergeGroupId, c.name, c.hex_code as hexCode
        FROM product_colors pc
        JOIN colors c ON pc.color_id = c.id
        WHERE pc.product_id = ?
      `).all(p.id);
      const compatibleModels = db.prepare(`
        SELECT mm.id, mm.name
        FROM product_motorcycle_compat pmc
        JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id
        WHERE pmc.product_id = ?
      `).all(p.id);

      let stockQuery = 'SELECT store_id as storeId, quantity FROM product_stock WHERE product_id = ?';
      const stockParams: any[] = [p.id];
      if (storeId) {
        stockQuery += ' AND store_id = ?';
        stockParams.push(storeId);
      }
      const stock = db.prepare(stockQuery).all(...stockParams) as any[];
      const totalStock = stock.reduce((sum, s) => sum + (s.quantity || 0), 0);

      return {
        ...p,
        priceAchat: p.price_achat,
        priceDetail: p.price_detail,
        priceSemiGros: p.price_semi_gros,
        priceGros: p.price_gros,
        colorMode: p.color_mode,
        location: p.location || '',
        barcodes,
        colors,
        compatibleModels,
        stock,
        totalStock
      };
    });
  });

  // Create Product
  ipcMain.handle('create-product', (_event, payload: any) => {
    const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM products').get() as any;
    const nextId = maxIdRow.nextId;
    const code = formatProductCode(nextId);

    const insertProd = db.prepare(`
      INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProd.run(nextId, code, payload.name, payload.categoryId || null, payload.brandId || null, payload.priceAchat, payload.priceDetail, payload.priceSemiGros, payload.priceGros, payload.colorMode, payload.location || '');

    const barcodes = payload.barcodes && payload.barcodes.length > 0 ? payload.barcodes : [generateBarcodeValue(nextId)];
    const insertBarcode = db.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
    for (const bc of barcodes.slice(0, 5)) {
      insertBarcode.run(nextId, bc, 'auto');
    }

    const insertColor = db.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
    if (payload.colorMode === 'single' && payload.colorIds && payload.colorIds.length > 0) {
      insertColor.run(nextId, payload.colorIds[0], null);
    } else if (payload.colorMode === 'variants' && payload.colorIds) {
      for (const cid of payload.colorIds) insertColor.run(nextId, cid, null);
    } else if (payload.colorMode === 'merged' && payload.mergeColorIds) {
      const mergeGroupId = `merge-${nextId}-${Date.now()}`;
      for (const cid of payload.mergeColorIds) insertColor.run(nextId, cid, mergeGroupId);
    }

    if (payload.compatibleModelIds) {
      const insertCompat = db.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
      for (const mid of payload.compatibleModelIds) insertCompat.run(nextId, mid);
    }

    const stores = db.prepare('SELECT id FROM stores').all() as any[];
    const insertStock = db.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'initial_stock', NULL)
    `);

    for (const s of stores) {
      const qty = payload.initialStock && payload.initialStock[s.id.toString()] ? payload.initialStock[s.id.toString()] : 0;
      insertStock.run(nextId, s.id, qty);
      if (qty > 0) {
        insertMovement.run(nextId, s.id, STOCK_MOVEMENT_CODES.ACHAT, 0, qty, qty, payload.userId || 1);
      }
    }

    return { id: nextId, code };
  });

  // Update Product (Edit)
  ipcMain.handle('update-product', (_event, payload: any) => {
    const { id, name, categoryId, brandId, priceAchat, priceDetail, priceSemiGros, priceGros, colorMode, location, colorIds, mergeColorIds, compatibleModelIds, barcodes } = payload;
    
    // Read avg_price_mode from settings
    const settings = db.prepare('SELECT avg_price_mode FROM settings WHERE store_id = 1').get() as any;
    const avgPriceMode = settings ? settings.avg_price_mode : 1;
    
    // Compute final price_achat
    let finalPriceAchat = priceAchat;
    if (avgPriceMode === 1) {
      const existing = db.prepare('SELECT price_achat FROM products WHERE id = ?').get(id) as any;
      if (existing && existing.price_achat > 0 && priceAchat !== existing.price_achat) {
        finalPriceAchat = Math.round((existing.price_achat + priceAchat) / 2);
      }
    }

    db.prepare(`
      UPDATE products SET name=?, category_id=?, brand_id=?, price_achat=?, price_detail=?, price_semi_gros=?, price_gros=?, color_mode=?, location=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, categoryId || null, brandId || null, finalPriceAchat, priceDetail, priceSemiGros, priceGros, colorMode, location || '', id);

    // Update colors
    db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(id);
    const insertColor = db.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
    if (colorMode === 'single' && colorIds && colorIds.length > 0) {
      insertColor.run(id, colorIds[0], null);
    } else if (colorMode === 'variants' && colorIds) {
      for (const cid of colorIds) insertColor.run(id, cid, null);
    } else if (colorMode === 'merged' && mergeColorIds) {
      const mergeGroupId = `merge-${id}-${Date.now()}`;
      for (const cid of mergeColorIds) insertColor.run(id, cid, mergeGroupId);
    }

    // Update motorcycle compat
    db.prepare('DELETE FROM product_motorcycle_compat WHERE product_id = ?').run(id);
    if (compatibleModelIds && compatibleModelIds.length > 0) {
      const insertCompat = db.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
      for (const mid of compatibleModelIds) insertCompat.run(id, mid);
    }

    // Update barcodes (keep up to 5)
    if (barcodes && barcodes.length > 0) {
      db.prepare('DELETE FROM product_barcodes WHERE product_id = ?').run(id);
      const insertBarcode = db.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
      for (const bc of barcodes.slice(0, 5)) insertBarcode.run(id, bc, 'manual');
    }

    return { success: true, id, finalPriceAchat };
  });

  // 5. Stock Overview & Movement Highlights
  ipcMain.handle('get-stock', (_event, params: { storeId?: number; q?: string }) => {
    const { storeId, q } = params || {};
    let sql = `
      SELECT p.id as productId, p.code as productCode, p.name as productName,
             p.price_achat as priceAchat, p.price_detail as priceDetail,
             c.name as categoryName, b.name as brandName,
             ps.store_id as storeId, s.name as storeName, ps.quantity as quantity
      FROM products p
      JOIN product_stock ps ON p.id = ps.product_id
      JOIN stores s ON ps.store_id = s.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    if (storeId) {
      sql += ' AND ps.store_id = ?';
      sqlParams.push(storeId);
    }
    if (q) {
      sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(b.name) LIKE ?)';
      const like = `%${q.toLowerCase()}%`;
      sqlParams.push(like, like, like);
    }
    sql += ' ORDER BY p.id DESC';

    const rows = db.prepare(sql).all(...sqlParams) as any[];

    return rows.map(r => {
      const lastMovement = db.prepare(`
        SELECT movement_code, qty_before, qty_after, delta, created_at
        FROM stock_movements
        WHERE product_id = ? AND store_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(r.productId, r.storeId) as any;

      return {
        ...r,
        lastMovementCode: lastMovement?.movement_code || null,
        hasRecentMovement: Boolean(lastMovement),
        isCode90Recent: lastMovement?.movement_code === STOCK_MOVEMENT_CODES.ACHAT,
        recentQtyBefore: lastMovement ? lastMovement.qty_before : null,
        recentQtyAfter: lastMovement ? lastMovement.qty_after : null,
        lastMovementDate: lastMovement?.created_at || null
      };
    });
  });

  // Stock Adjustment (Code 93)
  ipcMain.handle('adjust-stock', (_event, payload: any) => {
    const { productId, storeId, newQuantity, note, userId } = payload;
    const current = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, storeId) as any;
    const qtyBefore = current ? current.quantity : 0;
    const delta = newQuantity - qtyBefore;

    db.prepare(`
      INSERT INTO product_stock (product_id, store_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
    `).run(productId, storeId, newQuantity);

    db.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'adjustment', NULL)
    `).run(productId, storeId, STOCK_MOVEMENT_CODES.AJUSTEMENT, qtyBefore, newQuantity, delta, userId || 1);

    return { success: true, productId, storeId, qtyBefore, newQuantity, delta, note };
  });

  // Stock Transfer (Codes 94 & 95)
  ipcMain.handle('transfer-stock', (_event, payload: any) => {
    const { fromStoreId, toStoreId, productId, qty, userId, note } = payload;
    const sourceStock = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, fromStoreId) as any;
    const currentSourceQty = sourceStock ? sourceStock.quantity : 0;
    if (currentSourceQty < qty) throw new Error(`Stock insuffisant (${currentSourceQty} dispo)`);

    const destStock = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, toStoreId) as any;
    const currentDestQty = destStock ? destStock.quantity : 0;

    const newSourceQty = currentSourceQty - qty;
    const newDestQty = currentDestQty + qty;

    db.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = ?').run(newSourceQty, productId, fromStoreId);
    db.prepare(`
      INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
    `).run(productId, toStoreId, newDestQty);

    const transferRes = db.prepare('INSERT INTO stock_transfers (from_store_id, to_store_id, product_id, qty, user_id, note) VALUES (?, ?, ?, ?, ?, ?)').run(fromStoreId, toStoreId, productId, qty, userId || 1, note || null);
    const transferId = transferRes.lastInsertRowid;

    db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(productId, fromStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_SORTANT, currentSourceQty, newSourceQty, -qty, userId || 1, 'transfer', transferId);

    db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(productId, toStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_ENTRANT, currentDestQty, newDestQty, qty, userId || 1, 'transfer', transferId);

    return { success: true, transferId };
  });

  // Stock Movements Audit History (With filter for Vente, Transfert, Retour, Achat, Ajustement)
  ipcMain.handle('get-stock-movements', (_event, params?: { storeId?: number; movementCode?: number; limit?: number }) => {
    const { storeId, movementCode, limit = 100 } = params || {};
    let sql = `
      SELECT sm.*, p.name as productName, p.code as productCode, u.full_name as userName, s.name as storeName
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      JOIN stores s ON sm.store_id = s.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    if (storeId) {
      sql += ' AND sm.store_id = ?';
      sqlParams.push(storeId);
    }
    if (movementCode) {
      if (movementCode === 94) {
        sql += ' AND (sm.movement_code = 94 OR sm.movement_code = 95)';
      } else {
        sql += ' AND sm.movement_code = ?';
        sqlParams.push(movementCode);
      }
    }
    sql += ' ORDER BY sm.id DESC LIMIT ?';
    sqlParams.push(limit);

    return db.prepare(sql).all(...sqlParams);
  });

  // 6. POS Sale & Credit
  ipcMain.handle('create-sale', (_event, payload: any) => {
    const { storeId, clientId, userId, discount, amountPaid, paymentType, items, cashSessionId } = payload;
    const subtotal = items.reduce((sum: number, it: any) => sum + (it.qty * it.unitPrice), 0);
    const total = Math.max(0, subtotal - (discount || 0));
    const amountCredit = paymentType === 'credit' ? total : (paymentType === 'mixed' ? Math.max(0, total - amountPaid) : 0);
    const actualPaid = paymentType === 'credit' ? 0 : (paymentType === 'mixed' ? amountPaid : total);

    const saleRes = db.prepare(`
      INSERT INTO sales (store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).run(storeId, clientId || null, userId || 1, cashSessionId || null, subtotal, discount || 0, total, actualPaid, amountCredit, paymentType);
    const saleId = saleRes.lastInsertRowid;

    const insertSaleItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, product_color_id, price_tier, qty, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE product_stock SET quantity = quantity - ? WHERE product_id = ? AND store_id = ?');
    const insertMovement = db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

    for (const it of items) {
      insertSaleItem.run(saleId, it.productId, it.productColorId || null, it.priceTier, it.qty, it.unitPrice, it.lineTotal);
      const stockRow = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(it.productId, storeId) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore - it.qty;

      updateStock.run(it.qty, it.productId, storeId);
      insertMovement.run(it.productId, storeId, STOCK_MOVEMENT_CODES.VENTE, qtyBefore, qtyAfter, -it.qty, userId || 1, 'sale', saleId);
    }

    if (amountCredit > 0 && clientId) {
      db.prepare('INSERT INTO client_transactions (client_id, type, amount, sale_id, note) VALUES (?, ?, ?, ?, ?)')
        .run(clientId, 'achat', amountCredit, saleId, `Vente #${saleId} à crédit`);
    }

    return { saleId, total, amountPaid: actualPaid, amountCredit };
  });

  // Get Sales (for POS History and Returns)
  ipcMain.handle('get-sales', (_event, params?: { storeId?: number }) => {
    const { storeId } = params || {};
    let sql = `
      SELECT s.*, c.name as clientName, u.full_name as userName
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    if (storeId) {
      sql += ' AND s.store_id = ?';
      sqlParams.push(storeId);
    }
    sql += ' ORDER BY s.id DESC';

    const sales = db.prepare(sql).all(...sqlParams) as any[];
    return sales.map(s => {
      const items = db.prepare(`
        SELECT si.*, p.name as productName, p.code as productCode,
               (si.qty - COALESCE((SELECT SUM(ri.qty_returned) FROM return_items ri WHERE ri.sale_item_id = si.id), 0)) as returnableQty
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ?
      `).all(s.id);
      return { ...s, items };
    });
  });

  // 7. Retour Process
  ipcMain.handle('process-return', (_event, payload: any) => {
    const { saleId, storeId, userId, items } = payload;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
    if (!sale) throw new Error('Vente non trouvée');

    let totalRefund = 0;
    for (const it of items) {
      totalRefund += it.qtyReturned * it.unitPrice;
    }

    const returnRes = db.prepare('INSERT INTO returns (sale_id, store_id, user_id, total_refund) VALUES (?, ?, ?, ?)').run(saleId, storeId, userId || 1, totalRefund);
    const returnId = returnRes.lastInsertRowid;

    const insertReturnItem = db.prepare('INSERT INTO return_items (return_id, sale_item_id, qty_returned, unit_price, line_total) VALUES (?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE product_stock SET quantity = quantity + ? WHERE product_id = ? AND store_id = ?');
    const insertMovement = db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

    for (const it of items) {
      const saleItem = db.prepare('SELECT * FROM sale_items WHERE id = ?').get(it.saleItemId) as any;
      insertReturnItem.run(returnId, it.saleItemId, it.qtyReturned, it.unitPrice, it.lineTotal);

      const stockRow = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(saleItem.product_id, storeId) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore + it.qtyReturned;

      updateStock.run(it.qtyReturned, saleItem.product_id, storeId);
      insertMovement.run(saleItem.product_id, storeId, STOCK_MOVEMENT_CODES.RETOUR, qtyBefore, qtyAfter, it.qtyReturned, userId || 1, 'return', returnId);
    }

    if (sale.client_id) {
      db.prepare('INSERT INTO client_transactions (client_id, type, amount, sale_id, note) VALUES (?, ?, ?, ?, ?)')
        .run(sale.client_id, 'versement', totalRefund, saleId, `Avoir suite au retour #${returnId}`);
    }

    db.prepare(`UPDATE sales SET status = 'returned' WHERE id = ?`).run(saleId);
    return { returnId, totalRefund };
  });

  // 8. Purchases & Code 90 Stock Increase
  ipcMain.handle('create-purchase', (_event, payload: any) => {
    const { storeId, supplierId, userId, paymentType, amountPaid, items } = payload;
    const total = items.reduce((sum: number, it: any) => sum + (it.qty * it.unitCost), 0);

    const purchaseRes = db.prepare('INSERT INTO purchases (store_id, supplier_id, user_id, total, amount_paid, payment_type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(storeId, supplierId, userId || 1, total, amountPaid || 0, paymentType);
    const purchaseId = purchaseRes.lastInsertRowid;

    const insertItem = db.prepare('INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total) VALUES (?, ?, ?, ?, ?)');
    const insertMovement = db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

    // Get avg_price_mode setting
    const purchaseSettings = db.prepare('SELECT avg_price_mode FROM settings WHERE store_id = ?').get(storeId || 1) as any;
    const avgPriceMode = purchaseSettings ? (purchaseSettings.avg_price_mode || 1) : 1;

    for (const it of items) {
      insertItem.run(purchaseId, it.productId, it.qty, it.unitCost, it.qty * it.unitCost);

      const stockRow = db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(it.productId, storeId) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore + it.qty;

      db.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `).run(it.productId, storeId, qtyAfter);

      // Update product price_achat based on avg_price_mode setting
      const existingProduct = db.prepare('SELECT price_achat FROM products WHERE id = ?').get(it.productId) as any;
      if (existingProduct) {
        let newPriceAchat = it.unitCost;
        if (avgPriceMode === 1 && existingProduct.price_achat > 0 && it.unitCost !== existingProduct.price_achat) {
          // Average mode: (old_price + new_price) / 2
          newPriceAchat = Math.round((existingProduct.price_achat + it.unitCost) / 2);
        }
        db.prepare('UPDATE products SET price_achat = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newPriceAchat, it.productId);
      }

      // CODE 90 (Achat)
      insertMovement.run(it.productId, storeId, STOCK_MOVEMENT_CODES.ACHAT, qtyBefore, qtyAfter, it.qty, userId || 1, 'purchase', purchaseId);
    }

    const debt = total - (amountPaid || 0);
    if (debt > 0) {
      db.prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, purchase_id, note) VALUES (?, ?, ?, ?, ?)')
        .run(supplierId, 'achat', debt, purchaseId, `Achat #${purchaseId} reste dû`);
    }

    return { purchaseId, total };
  });

  // Get Purchases with item lines (For Purchases Page History)
  ipcMain.handle('get-purchases', (_event, params?: { storeId?: number }) => {
    const { storeId } = params || {};
    let sql = `
      SELECT p.*, s.name as supplierName, s.phone as supplierPhone, u.full_name as userName
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    if (storeId) {
      sql += ' AND p.store_id = ?';
      sqlParams.push(storeId);
    }
    sql += ' ORDER BY p.id DESC';

    const purchases = db.prepare(sql).all(...sqlParams) as any[];
    return purchases.map(pur => {
      const items = db.prepare(`
        SELECT pi.*, p.name as productName, p.code as productCode
        FROM purchase_items pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.purchase_id = ?
      `).all(pur.id);
      return { ...pur, items };
    });
  });

  // 9. Reports
  ipcMain.handle('get-reports', (_event, params?: { storeId?: number; period?: string }) => {
    const { storeId, period = 'month' } = params || {};
    let dateFilter = "created_at >= datetime('now', '-30 days')";
    if (period === 'day') dateFilter = "date(created_at) = date('now')";
    else if (period === 'week') dateFilter = "created_at >= datetime('now', '-7 days')";

    let salesSql = `SELECT * FROM sales WHERE ${dateFilter}`;
    const salesParams: any[] = [];
    if (storeId) {
      salesSql += ' AND store_id = ?';
      salesParams.push(storeId);
    }
    const sales = db.prepare(salesSql).all(...salesParams) as any[];

    const totalCA = sales.reduce((acc, s) => acc + s.total, 0);
    const salesCount = sales.length;
    const totalBeneficesBrut = Math.max(0, Math.round(totalCA * 0.35));

    // Calculate total expenses for the period
    let depFilter = dateFilter.replace(/created_at/g, 'depense_date');
    let depSql = `SELECT COALESCE(SUM(amount), 0) as totalDep FROM depenses WHERE ${depFilter}`;
    const depParams: any[] = [];
    if (storeId) {
      depSql += ' AND store_id = ?';
      depParams.push(storeId);
    }
    const depRow = db.prepare(depSql).get(...depParams) as any;
    const totalDepenses = depRow?.totalDep || 0;
    const totalBenefices = Math.max(0, totalBeneficesBrut - totalDepenses);

    const clientsDebt = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'achat' THEN amount WHEN type = 'versement' THEN -amount ELSE 0 END), 0) as debt
      FROM client_transactions
    `).get() as any;

    const topProducts = db.prepare(`
      SELECT p.code, p.name as productName, SUM(si.qty) as qtySold, SUM(si.line_total) as revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE ${dateFilter.replace(/created_at/g, 's.created_at')}
      GROUP BY si.product_id
      ORDER BY revenue DESC LIMIT 5
    `).all();

    const chartData = db.prepare(`
      SELECT date(created_at) as date, SUM(total) as ca, ROUND(SUM(total) * 0.35) as benefice, COUNT(id) as ventesCount
      FROM sales
      WHERE ${dateFilter}
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all();

    return {
      totalCA,
      totalBeneficesBrut,
      totalDepenses,
      totalBenefices,
      salesCount,
      totalDetteClients: clientsDebt?.debt || 0,
      topProducts,
      chartData: chartData.length > 0 ? chartData : [
        { date: new Date().toISOString().slice(0, 10), ca: totalCA, benefice: totalBenefices, ventesCount: salesCount }
      ]
    };
  });

  // Metadata queries
  ipcMain.handle('get-metadata', () => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    const brands = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
    const colors = db.prepare('SELECT * FROM colors ORDER BY id ASC').all();
    const motorcycleModels = db.prepare('SELECT * FROM motorcycle_models ORDER BY name ASC').all();
    const stores = db.prepare('SELECT * FROM stores ORDER BY id ASC').all();
    return { categories, brands, colors, motorcycleModels, stores };
  });

  // Clients & Suppliers
  ipcMain.handle('get-clients', () => {
    const list = db.prepare('SELECT * FROM clients ORDER BY is_fidele DESC, name ASC').all() as any[];
    return list.map(c => {
      const txs = db.prepare('SELECT type, amount FROM client_transactions WHERE client_id = ?').all(c.id) as any[];
      const currentDebt = txs.reduce((acc, tx) => tx.type === 'achat' ? acc + tx.amount : (tx.type === 'versement' ? acc - tx.amount : acc), 0);
      return { ...c, isFidele: Boolean(c.is_fidele), currentDebt: Math.max(0, currentDebt) };
    });
  });

  ipcMain.handle('create-client', (_event, payload: { name: string; phone?: string; address?: string; isFidele?: boolean; creditLimit?: number }) => {
    const res = db.prepare('INSERT INTO clients (name, phone, address, is_fidele, credit_limit) VALUES (?, ?, ?, ?, ?)')
      .run(payload.name, payload.phone || '', payload.address || '', payload.isFidele ? 1 : 0, payload.creditLimit || 0);
    return { id: res.lastInsertRowid, ...payload };
  });

  ipcMain.handle('create-client-versement', (_event, payload: { clientId: number; amount: number; note?: string }) => {
    return db.prepare('INSERT INTO client_transactions (client_id, type, amount, note) VALUES (?, ?, ?, ?)')
      .run(payload.clientId, 'versement', payload.amount, payload.note || 'Versement');
  });

  ipcMain.handle('get-client-transactions', (_event, clientId: number) => {
    return db.prepare('SELECT * FROM client_transactions WHERE client_id = ? ORDER BY id DESC').all(clientId);
  });

  ipcMain.handle('get-suppliers', () => {
    const list = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all() as any[];
    return list.map(s => {
      const txs = db.prepare('SELECT type, amount FROM supplier_transactions WHERE supplier_id = ?').all(s.id) as any[];
      const currentDebt = txs.reduce((acc, tx) => tx.type === 'achat' ? acc + tx.amount : (tx.type === 'versement' ? acc - tx.amount : acc), 0);
      return { ...s, currentDebt: Math.max(0, currentDebt) };
    });
  });

  ipcMain.handle('create-supplier', (_event, payload: { name: string; phone?: string; address?: string }) => {
    const res = db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?, ?, ?)')
      .run(payload.name, payload.phone || '', payload.address || '');
    return { id: res.lastInsertRowid, ...payload };
  });

  ipcMain.handle('create-supplier-versement', (_event, payload: { supplierId: number; amount: number; note?: string }) => {
    return db.prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, note) VALUES (?, ?, ?, ?)')
      .run(payload.supplierId, 'versement', payload.amount, payload.note || 'Règlement fournisseur');
  });

  ipcMain.handle('get-supplier-transactions', (_event, supplierId: number) => {
    return db.prepare('SELECT * FROM supplier_transactions WHERE supplier_id = ? ORDER BY id DESC').all(supplierId);
  });

  // Settings
  ipcMain.handle('get-settings', (_event, storeId: number) => {
    return db.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId || 1);
  });

  ipcMain.handle('save-settings', (_event, payload: any) => {
    return db.prepare(`
      INSERT INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition, avg_price_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        store_name = excluded.store_name,
        address = excluded.address,
        phone = excluded.phone,
        printer_type = excluded.printer_type,
        printer_target = excluded.printer_target,
        receipt_footer = excluded.receipt_footer,
        nif = excluded.nif,
        nis = excluded.nis,
        rc = excluded.rc,
        article_imposition = excluded.article_imposition,
        avg_price_mode = excluded.avg_price_mode
    `).run(payload.storeId, payload.storeName, payload.address, payload.phone, payload.printerType, payload.printerTarget, payload.receiptFooter, payload.taxRate || 0, payload.nif || '', payload.nis || '', payload.rc || '', payload.articleImposition || '', payload.avgPriceMode !== undefined ? (payload.avgPriceMode ? 1 : 0) : 1);
  });

  ipcMain.handle('get-printers', async (event) => {
    try {
      const list = await event.sender.getPrintersAsync();
      if (list && list.length > 0) {
        return list.map(p => ({
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: p.isDefault,
          type: p.name.toLowerCase().includes('pos') || p.name.toLowerCase().includes('thermal') || p.name.toLowerCase().includes('tm') ? 'thermal' : 'system'
        }));
      }
    } catch {}
    return [
      { name: 'POS-80 Thermal Printer (USB)', displayName: 'POS-80 Thermal Printer (USB)', isDefault: true, type: 'thermal' },
      { name: 'EPSON TM-T20III Receipt (USB)', displayName: 'EPSON TM-T20III Receipt (USB)', isDefault: false, type: 'thermal' },
      { name: 'Xprinter XP-N160I (LAN)', displayName: 'Xprinter XP-N160I (LAN)', isDefault: false, type: 'thermal' },
      { name: 'Microsoft Print to PDF', displayName: 'Microsoft Print to PDF', isDefault: false, type: 'virtual' }
    ];
  });

  ipcMain.handle('print-receipt', (_event, payload: any) => {
    const { sale, store, settings, cashierName } = payload || {};
    const total = (sale?.total || 0) / 100;
    const receiptText = `
================================================
          ${settings?.storeName || store?.name || 'PIECES CYCLES & MOTOS'}
          ${settings?.address || store?.address || 'Alger'}
          Tél: ${settings?.phone || store?.phone || ''}
================================================
TICKET N°: ${String(sale?.id || 1).padStart(6, '0')}
DATE: ${new Date().toLocaleDateString('fr-DZ')} ${new Date().toLocaleTimeString('fr-DZ')}
CAISSIER: ${cashierName || 'Vendeur'}
------------------------------------------------
TOTAL GENERAL: ${total.toFixed(2)} DA
MODE PAIEMENT: ${(sale?.paymentType || 'CASH').toUpperCase()}
------------------------------------------------
${settings?.receiptFooter || 'Merci pour votre confiance !'}
================================================
    `.trim();
    return { success: true, receiptText };
  });

  // Dépenses (Expenses)
  ipcMain.handle('get-expense-categories', () => {
    return db.prepare('SELECT * FROM expense_categories ORDER BY id ASC').all();
  });

  ipcMain.handle('get-depenses', (_event, params?: { storeId?: number; categoryId?: number; dateFrom?: string; dateTo?: string }) => {
    const { storeId, categoryId, dateFrom, dateTo } = params || {};
    let sql = `
      SELECT d.*, ec.name as categoryName, u.full_name as userName, st.name as storeName
      FROM depenses d
      JOIN expense_categories ec ON d.category_id = ec.id
      JOIN users u ON d.user_id = u.id
      JOIN stores st ON d.store_id = st.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];
    if (storeId) { sql += ' AND d.store_id = ?'; sqlParams.push(storeId); }
    if (categoryId) { sql += ' AND d.category_id = ?'; sqlParams.push(categoryId); }
    if (dateFrom) { sql += ' AND date(d.depense_date) >= date(?)'; sqlParams.push(dateFrom); }
    if (dateTo) { sql += ' AND date(d.depense_date) <= date(?)'; sqlParams.push(dateTo); }
    sql += ' ORDER BY d.id DESC';
    return db.prepare(sql).all(...sqlParams);
  });

  ipcMain.handle('create-depense', (_event, payload: any) => {
    const { storeId, categoryId, amount, note, userId, depenseDate } = payload;
    const res = db.prepare(`
      INSERT INTO depenses (store_id, category_id, amount, note, user_id, depense_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(storeId, categoryId, amount, note || '', userId || 1, depenseDate || new Date().toISOString());
    return { id: res.lastInsertRowid, success: true };
  });

  ipcMain.handle('delete-depense', (_event, id: number) => {
    db.prepare('DELETE FROM depenses WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('get-depenses-total', (_event, params?: { storeId?: number; dateFrom?: string; dateTo?: string }) => {
    const { storeId, dateFrom, dateTo } = params || {};
    let sql = `SELECT COALESCE(SUM(amount), 0) as total FROM depenses WHERE 1=1`;
    const sqlParams: any[] = [];
    if (storeId) { sql += ' AND store_id = ?'; sqlParams.push(storeId); }
    if (dateFrom) { sql += ' AND date(depense_date) >= date(?)'; sqlParams.push(dateFrom); }
    if (dateTo) { sql += ' AND date(depense_date) <= date(?)'; sqlParams.push(dateTo); }
    const row = db.prepare(sql).get(...sqlParams) as any;
    return row?.total || 0;
  });

  // Keyboard Shortcuts
  ipcMain.handle('get-shortcuts', () => {
    const rows = db.prepare('SELECT action, shortcut FROM keyboard_shortcuts').all() as any[];
    const result: Record<string, string> = {};
    for (const r of rows) result[r.action] = r.shortcut;
    return result;
  });

  ipcMain.handle('save-shortcuts', (_event, shortcuts: Record<string, string>) => {
    const upsert = db.prepare('INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?, ?) ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut');
    for (const [action, shortcut] of Object.entries(shortcuts)) {
      upsert.run(action, shortcut);
    }
    return { success: true };
  });

  ipcMain.handle('add-expense-category', (_event, name: string) => {
    try {
      const res = db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name);
      return { id: res.lastInsertRowid, name };
    } catch {
      return { error: 'Catégorie déjà existante' };
    }
  });
}
