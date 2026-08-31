import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SyncBatchPayload } from '@gestion-veloo/shared';

const router = Router();

// POST /api/sync/push (Store pushes offline transactions to central server)
router.post('/push', (req, res) => {
  const payload: SyncBatchPayload = req.body;
  const { rawDb, isPg } = getDb();

  if (isPg) {
    return res.json({ success: true, syncedTimestamp: new Date().toISOString() });
  }

  try {
    const { storeId, sales, returns, purchases, stockMovements, clientTransactions, supplierTransactions, stockTransfers, depenses } = payload;

    // Apply Sales
    if (sales && sales.length > 0) {
      const insertSale = rawDb.prepare(`
        INSERT OR IGNORE INTO sales (id, store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of sales) {
        insertSale.run(s.id, storeId, s.clientId || null, s.userId, s.cashSessionId || null, s.subtotal, s.discount || 0, s.total, s.amountPaid, s.amountCredit, s.paymentType, s.status, s.createdAt);
      }
    }

    // Apply Returns
    if (returns && returns.length > 0) {
      const insertReturn = rawDb.prepare(`
        INSERT OR IGNORE INTO returns (id, sale_id, store_id, user_id, total_refund, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const r of returns) {
        insertReturn.run(r.id, r.saleId, storeId, r.userId, r.totalRefund, r.createdAt);
      }
    }

    // Apply Purchases
    if (purchases && purchases.length > 0) {
      const insertPurchase = rawDb.prepare(`
        INSERT OR IGNORE INTO purchases (id, store_id, supplier_id, user_id, total, amount_paid, payment_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of purchases) {
        insertPurchase.run(p.id, storeId, p.supplierId, p.userId, p.total, p.amountPaid, p.paymentType, p.createdAt);
      }
    }

    // Apply Stock Movements
    if (stockMovements && stockMovements.length > 0) {
      const insertMovement = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_movements (id, product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const sm of stockMovements) {
        insertMovement.run(sm.id, sm.productId, storeId, sm.movementCode, sm.qtyBefore, sm.qtyAfter, sm.delta, sm.userId, sm.refType || null, sm.refId || null, sm.createdAt);
      }
    }

    // Apply Client Transactions
    if (clientTransactions && clientTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO client_transactions (id, client_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const tx of clientTransactions) {
        insertTx.run(tx.id, tx.clientId, tx.type, tx.amount, tx.note || null, tx.createdAt);
      }
    }

    // Apply Supplier Transactions
    if (supplierTransactions && supplierTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO supplier_transactions (id, supplier_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const tx of supplierTransactions) {
        insertTx.run(tx.id, tx.supplierId, tx.type, tx.amount, tx.note || null, tx.createdAt);
      }
    }

    // Apply Stock Transfers
    if (stockTransfers && stockTransfers.length > 0) {
      const insertTransfer = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_transfers (id, from_store_id, to_store_id, product_id, qty, user_id, note, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const st of stockTransfers) {
        insertTransfer.run(st.id, st.fromStoreId, st.toStoreId, st.productId, st.qty, st.userId, st.note || null, (st as any).status || 'completed', st.createdAt);
      }
    }

    // Apply Dépenses
    if (depenses && depenses.length > 0) {
      const insertDep = rawDb.prepare(`
        INSERT OR IGNORE INTO depenses (id, store_id, category_id, amount, note, user_id, depense_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const d of depenses) {
        insertDep.run(d.id, storeId, d.categoryId, d.amount, d.note || null, d.userId || 1, d.depenseDate || d.createdAt, d.createdAt || new Date().toISOString());
      }
    }

    // Update Live Product Stock
    if (stockMovements && stockMovements.length > 0) {
      const updateStock = rawDb.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `);
      for (const sm of stockMovements) {
        updateStock.run(sm.productId, storeId, sm.qtyAfter);
      }
    }

    res.json({
      success: true,
      syncedTimestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la synchronisation push', details: err.message });
  }
});

// GET /api/sync/pull (Store pulls updated catalog & sales from server)
router.get('/pull', (req, res) => {
  const { rawDb, isPg } = getDb();
  const storeIdParam = req.query.storeId ? Number(req.query.storeId) : undefined;

  if (isPg) {
    return res.json({ success: true, syncedTimestamp: new Date().toISOString() });
  }

  const products = rawDb.prepare('SELECT * FROM products').all();
  const barcodes = rawDb.prepare('SELECT * FROM product_barcodes').all();
  const colors = rawDb.prepare('SELECT * FROM colors').all();
  const productColors = rawDb.prepare('SELECT * FROM product_colors').all();
  const categories = rawDb.prepare('SELECT * FROM categories').all();
  const brands = rawDb.prepare('SELECT * FROM brands').all();
  const motorcycleModels = rawDb.prepare('SELECT * FROM motorcycle_models').all();
  const productStock = rawDb.prepare('SELECT * FROM product_stock').all();
  const expenseCategories = rawDb.prepare('SELECT * FROM expense_categories').all();
  const settings = rawDb.prepare('SELECT * FROM settings').all();
  
  // Also return sales and depenses for this store
  let sales = [];
  let depenses = [];
  if (storeIdParam) {
    sales = rawDb.prepare('SELECT * FROM sales WHERE store_id = ?').all(storeIdParam);
    depenses = rawDb.prepare('SELECT * FROM depenses WHERE store_id = ?').all(storeIdParam);
  } else {
    sales = rawDb.prepare('SELECT * FROM sales').all();
    depenses = rawDb.prepare('SELECT * FROM depenses').all();
  }

  res.json({
    success: true,
    syncedTimestamp: new Date().toISOString(),
    catalogUpdates: {
      products,
      barcodes,
      colors,
      productColors,
      categories,
      brands,
      motorcycleModels,
      productStock,
      expenseCategories,
      settings,
      sales,
      depenses
    }
  });
});

export default router;
