import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SyncBatchPayload } from '@gestion-veloo/shared';

const router = Router();

// POST /api/sync/push (Store pushes offline transactions to central server)
router.post('/push', authenticateToken, (req: AuthRequest, res: Response) => {
  const payload: SyncBatchPayload = req.body;
  const { rawDb, isPg } = getDb();

  if (isPg) {
    return res.json({ success: true, syncedTimestamp: new Date().toISOString() });
  }

  try {
    const { storeId, sales, returns, purchases, stockMovements, clientTransactions, supplierTransactions, stockTransfers } = payload;

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
      const insertClientTx = rawDb.prepare(`
        INSERT OR IGNORE INTO client_transactions (id, client_id, type, amount, sale_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ct of clientTransactions) {
        insertClientTx.run(ct.id, ct.clientId, ct.type, ct.amount, ct.saleId || null, ct.note || null, ct.createdAt);
      }
    }

    // Apply Supplier Transactions
    if (supplierTransactions && supplierTransactions.length > 0) {
      const insertSupplierTx = rawDb.prepare(`
        INSERT OR IGNORE INTO supplier_transactions (id, supplier_id, type, amount, purchase_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const st of supplierTransactions) {
        insertSupplierTx.run(st.id, st.supplierId, st.type, st.amount, st.purchaseId || null, st.note || null, st.createdAt);
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

// GET /api/sync/pull (Store pulls updated catalog & products from server)
router.get('/pull', authenticateToken, (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
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
      productStock
    }
  });
});

export default router;
