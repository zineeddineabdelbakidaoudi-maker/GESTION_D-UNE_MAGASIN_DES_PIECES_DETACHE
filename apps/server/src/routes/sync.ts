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

    // Apply Sales & Sale Items
    if (sales && sales.length > 0) {
      const insertSale = rawDb.prepare(`
        INSERT INTO sales (id, store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subtotal = excluded.subtotal,
          discount = excluded.discount,
          total = excluded.total,
          amount_paid = excluded.amount_paid,
          amount_credit = excluded.amount_credit,
          status = excluded.status
      `);

      const insertSaleItem = rawDb.prepare(`
        INSERT INTO sale_items (sale_id, product_id, price_tier, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const item of sales) {
        const s = item as any;
        insertSale.run(
          s.id,
          s.storeId || s.store_id || storeId || 1,
          s.clientId || s.client_id || null,
          s.userId || s.user_id || 1,
          s.cashSessionId || s.cash_session_id || null,
          s.subtotal || s.total,
          s.discount || 0,
          s.total,
          s.amountPaid || s.amount_paid || s.total,
          s.amountCredit || s.amount_credit || 0,
          s.paymentType || s.payment_type || 'cash',
          s.status || 'completed',
          s.createdAt || s.created_at || new Date().toISOString()
        );

        if (s.items && Array.isArray(s.items) && s.items.length > 0) {
          rawDb.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(s.id);
          for (const rawIt of s.items) {
            const it = rawIt as any;
            insertSaleItem.run(
              s.id,
              it.productId || it.product_id || 1,
              it.priceTier || it.price_tier || 'detail',
              it.qty || 1,
              it.unitPrice || it.unit_price || 0,
              it.lineTotal || it.line_total || ((it.qty || 1) * (it.unitPrice || it.unit_price || 0))
            );
          }
        }
      }
    }

    // Apply Returns
    if (returns && returns.length > 0) {
      const insertReturn = rawDb.prepare(`
        INSERT OR IGNORE INTO returns (id, sale_id, store_id, user_id, total_refund, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawR of returns) {
        const r = rawR as any;
        insertReturn.run(r.id, r.saleId || r.sale_id, storeId, r.userId || r.user_id || 1, r.totalRefund || r.total_refund, r.createdAt || r.created_at || new Date().toISOString());
      }
    }

    // Apply Purchases
    if (purchases && purchases.length > 0) {
      const insertPurchase = rawDb.prepare(`
        INSERT OR IGNORE INTO purchases (id, store_id, supplier_id, user_id, total, amount_paid, payment_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawP of purchases) {
        const p = rawP as any;
        insertPurchase.run(p.id, storeId, p.supplierId || p.supplier_id || null, p.userId || p.user_id || 1, p.total, p.amountPaid || p.amount_paid || p.total, p.paymentType || p.payment_type || 'cash', p.createdAt || p.created_at || new Date().toISOString());
      }
    }

    // Apply Stock Movements
    if (stockMovements && stockMovements.length > 0) {
      const insertMovement = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_movements (id, product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawSm of stockMovements) {
        const sm = rawSm as any;
        insertMovement.run(
          sm.id,
          sm.productId || sm.product_id,
          storeId,
          sm.movementCode || sm.movement_code,
          sm.qtyBefore !== undefined ? sm.qtyBefore : (sm.qty_before || 0),
          sm.qtyAfter !== undefined ? sm.qtyAfter : (sm.qty_after || 0),
          sm.delta,
          sm.userId || sm.user_id || 1,
          sm.refType || sm.ref_type || null,
          sm.refId || sm.ref_id || null,
          sm.createdAt || sm.created_at || new Date().toISOString()
        );
      }
    }

    // Apply Client Transactions
    if (clientTransactions && clientTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO client_transactions (id, client_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawTx of clientTransactions) {
        const tx = rawTx as any;
        insertTx.run(tx.id, tx.clientId || tx.client_id, tx.type, tx.amount, tx.note || null, tx.createdAt || tx.created_at || new Date().toISOString());
      }
    }

    // Apply Supplier Transactions
    if (supplierTransactions && supplierTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO supplier_transactions (id, supplier_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawTx of supplierTransactions) {
        const tx = rawTx as any;
        insertTx.run(tx.id, tx.supplierId || tx.supplier_id, tx.type, tx.amount, tx.note || null, tx.createdAt || tx.created_at || new Date().toISOString());
      }
    }

    // Apply Stock Transfers
    if (stockTransfers && stockTransfers.length > 0) {
      const insertTransfer = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_transfers (id, from_store_id, to_store_id, product_id, qty, user_id, note, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawSt of stockTransfers) {
        const st = rawSt as any;
        insertTransfer.run(st.id, st.fromStoreId || st.from_store_id, st.toStoreId || st.to_store_id, st.productId || st.product_id, st.qty, st.userId || st.user_id || 1, st.note || null, st.status || 'completed', st.createdAt || st.created_at || new Date().toISOString());
      }
    }

    // Apply Dépenses
    if (depenses && depenses.length > 0) {
      const insertDep = rawDb.prepare(`
        INSERT OR IGNORE INTO depenses (id, store_id, category_id, amount, note, user_id, depense_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawD of depenses) {
        const d = rawD as any;
        insertDep.run(
          d.id,
          storeId,
          d.categoryId || d.category_id,
          d.amount,
          d.note || null,
          d.userId || d.user_id || 1,
          d.depenseDate || d.depense_date || d.createdAt || d.created_at,
          d.createdAt || d.created_at || new Date().toISOString()
        );
      }
    }

    // Update Live Product Stock
    if (stockMovements && stockMovements.length > 0) {
      const updateStock = rawDb.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `);
      for (const rawSm of stockMovements) {
        const sm = rawSm as any;
        const pId = sm.productId || sm.product_id;
        const qAfter = sm.qtyAfter !== undefined ? sm.qtyAfter : sm.qty_after;
        if (pId && qAfter !== undefined) {
          updateStock.run(pId, storeId, qAfter);
        }
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
