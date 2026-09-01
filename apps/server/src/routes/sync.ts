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
    const { storeId = 1, sales, returns, purchases, stockMovements, clientTransactions, supplierTransactions, stockTransfers, depenses } = payload || {};

    const validStoreId = Number(storeId) || 1;

    // Helper functions for safe foreign keys
    const getSafeUserId = (uid: any): number => {
      if (!uid) return 1;
      const row = rawDb.prepare('SELECT id FROM users WHERE id = ?').get(Number(uid));
      return row ? Number(uid) : 1;
    };

    const getSafeClientId = (cid: any): number | null => {
      if (!cid) return null;
      const row = rawDb.prepare('SELECT id FROM clients WHERE id = ?').get(Number(cid));
      return row ? Number(cid) : null;
    };

    const getSafeSupplierId = (sid: any): number | null => {
      if (!sid) return null;
      const row = rawDb.prepare('SELECT id FROM suppliers WHERE id = ?').get(Number(sid));
      return row ? Number(sid) : null;
    };

    const getSafeProductId = (pid: any): number => {
      if (!pid) return 1;
      const row = rawDb.prepare('SELECT id FROM products WHERE id = ?').get(Number(pid));
      return row ? Number(pid) : 1;
    };

    const getSafeCategoryId = (catId: any): number => {
      if (!catId) return 1;
      const row = rawDb.prepare('SELECT id FROM expense_categories WHERE id = ?').get(Number(catId));
      return row ? Number(catId) : 1;
    };

    // Temporarily relax foreign keys during sync upsert so offline store records sync cleanly
    rawDb.pragma('foreign_keys = OFF');

    // 1. Apply Sales & Sale Items
    if (sales && sales.length > 0) {
      const insertSale = rawDb.prepare(`
        INSERT INTO sales (id, store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
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
        try {
          const s = item as any;
          const safeUser = getSafeUserId(s.userId || s.user_id);
          const safeClient = getSafeClientId(s.clientId || s.client_id);

          insertSale.run(
            Number(s.id),
            Number(s.storeId || s.store_id || validStoreId),
            safeClient,
            safeUser,
            Number(s.subtotal || s.total || 0),
            Number(s.discount || 0),
            Number(s.total || 0),
            Number(s.amountPaid || s.amount_paid || s.total || 0),
            Number(s.amountCredit || s.amount_credit || 0),
            String(s.paymentType || s.payment_type || 'cash'),
            String(s.status || 'completed'),
            String(s.createdAt || s.created_at || new Date().toISOString())
          );

          if (s.items && Array.isArray(s.items) && s.items.length > 0) {
            rawDb.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(Number(s.id));
            for (const rawIt of s.items) {
              const it = rawIt as any;
              const safeProd = getSafeProductId(it.productId || it.product_id);
              const qty = Number(it.qty || 1);
              const unitPrice = Number(it.unitPrice || it.unit_price || 0);
              const lineTotal = Number(it.lineTotal || it.line_total || (qty * unitPrice));

              insertSaleItem.run(
                Number(s.id),
                safeProd,
                String(it.priceTier || it.price_tier || 'detail'),
                qty,
                unitPrice,
                lineTotal
              );
            }
          }
        } catch (sErr: any) {
          console.error('Error inserting synced sale:', sErr);
        }
      }
    }

    // 2. Apply Returns
    if (returns && returns.length > 0) {
      const insertReturn = rawDb.prepare(`
        INSERT OR IGNORE INTO returns (id, sale_id, store_id, user_id, total_refund, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawR of returns) {
        try {
          const r = rawR as any;
          insertReturn.run(
            Number(r.id),
            Number(r.saleId || r.sale_id),
            validStoreId,
            getSafeUserId(r.userId || r.user_id),
            Number(r.totalRefund || r.total_refund || 0),
            String(r.createdAt || r.created_at || new Date().toISOString())
          );
        } catch {}
      }
    }

    // 3. Apply Purchases
    if (purchases && purchases.length > 0) {
      const insertPurchase = rawDb.prepare(`
        INSERT OR IGNORE INTO purchases (id, store_id, supplier_id, user_id, total, amount_paid, payment_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawP of purchases) {
        try {
          const p = rawP as any;
          insertPurchase.run(
            Number(p.id),
            validStoreId,
            getSafeSupplierId(p.supplierId || p.supplier_id),
            getSafeUserId(p.userId || p.user_id),
            Number(p.total || 0),
            Number(p.amountPaid || p.amount_paid || p.total || 0),
            String(p.paymentType || p.payment_type || 'cash'),
            String(p.createdAt || p.created_at || new Date().toISOString())
          );
        } catch {}
      }
    }

    // 4. Apply Stock Movements
    if (stockMovements && stockMovements.length > 0) {
      const insertMovement = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_movements (id, product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawSm of stockMovements) {
        try {
          const sm = rawSm as any;
          insertMovement.run(
            Number(sm.id),
            getSafeProductId(sm.productId || sm.product_id),
            validStoreId,
            Number(sm.movementCode || sm.movement_code || 91),
            Number(sm.qtyBefore !== undefined ? sm.qtyBefore : (sm.qty_before || 0)),
            Number(sm.qtyAfter !== undefined ? sm.qtyAfter : (sm.qty_after || 0)),
            Number(sm.delta || 0),
            getSafeUserId(sm.userId || sm.user_id),
            sm.refType || sm.ref_type || null,
            sm.refId || sm.ref_id || null,
            String(sm.createdAt || sm.created_at || new Date().toISOString())
          );
        } catch {}
      }
    }

    // 5. Apply Client Transactions
    if (clientTransactions && clientTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO client_transactions (id, client_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawTx of clientTransactions) {
        try {
          const tx = rawTx as any;
          const safeC = getSafeClientId(tx.clientId || tx.client_id);
          if (safeC) {
            insertTx.run(
              Number(tx.id),
              safeC,
              String(tx.type || 'achat'),
              Number(tx.amount || 0),
              tx.note || null,
              String(tx.createdAt || tx.created_at || new Date().toISOString())
            );
          }
        } catch {}
      }
    }

    // 6. Apply Supplier Transactions
    if (supplierTransactions && supplierTransactions.length > 0) {
      const insertTx = rawDb.prepare(`
        INSERT OR IGNORE INTO supplier_transactions (id, supplier_id, type, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const rawTx of supplierTransactions) {
        try {
          const tx = rawTx as any;
          const safeS = getSafeSupplierId(tx.supplierId || tx.supplier_id);
          if (safeS) {
            insertTx.run(
              Number(tx.id),
              safeS,
              String(tx.type || 'achat'),
              Number(tx.amount || 0),
              tx.note || null,
              String(tx.createdAt || tx.created_at || new Date().toISOString())
            );
          }
        } catch {}
      }
    }

    // 7. Apply Stock Transfers
    if (stockTransfers && stockTransfers.length > 0) {
      const insertTransfer = rawDb.prepare(`
        INSERT OR IGNORE INTO stock_transfers (id, from_store_id, to_store_id, product_id, qty, user_id, note, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawSt of stockTransfers) {
        try {
          const st = rawSt as any;
          insertTransfer.run(
            Number(st.id),
            Number(st.fromStoreId || st.from_store_id || 1),
            Number(st.toStoreId || st.to_store_id || 2),
            getSafeProductId(st.productId || st.product_id),
            Number(st.qty || 0),
            getSafeUserId(st.userId || st.user_id),
            st.note || null,
            String(st.status || 'completed'),
            String(st.createdAt || st.created_at || new Date().toISOString())
          );
        } catch {}
      }
    }

    // 8. Apply Dépenses
    if (depenses && depenses.length > 0) {
      const insertDep = rawDb.prepare(`
        INSERT OR IGNORE INTO depenses (id, store_id, category_id, amount, note, user_id, depense_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rawD of depenses) {
        try {
          const d = rawD as any;
          insertDep.run(
            Number(d.id),
            validStoreId,
            getSafeCategoryId(d.categoryId || d.category_id),
            Number(d.amount || 0),
            d.note || null,
            getSafeUserId(d.userId || d.user_id),
            String(d.depenseDate || d.depense_date || d.createdAt || d.created_at || new Date().toISOString().slice(0, 10)),
            String(d.createdAt || d.created_at || new Date().toISOString())
          );
        } catch {}
      }
    }

    // 9. Update Live Product Stock
    if (stockMovements && stockMovements.length > 0) {
      const updateStock = rawDb.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `);
      for (const rawSm of stockMovements) {
        try {
          const sm = rawSm as any;
          const pId = getSafeProductId(sm.productId || sm.product_id);
          const qAfter = sm.qtyAfter !== undefined ? sm.qtyAfter : sm.qty_after;
          if (pId && qAfter !== undefined) {
            updateStock.run(pId, validStoreId, Number(qAfter));
          }
        } catch {}
      }
    }

    // Re-enable foreign keys
    rawDb.pragma('foreign_keys = ON');

    res.json({
      success: true,
      syncedTimestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Server sync error:', err);
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
