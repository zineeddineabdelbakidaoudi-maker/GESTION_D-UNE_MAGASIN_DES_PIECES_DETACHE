import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createPurchaseSchema } from '@gestion-veloo/shared';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';

const router = Router();

// GET /api/purchases
router.get('/', authenticateToken, requirePermission('achat', 'view'), (req: AuthRequest, res: Response) => {
  const { storeId } = req.query;
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  let sql = `
    SELECT p.*, s.name as supplier_name, st.name as store_name, u.full_name as user_full_name
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    JOIN stores st ON p.store_id = st.id
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (storeId) {
    sql += ' AND p.store_id = ?';
    params.push(storeId);
  }
  sql += ' ORDER BY p.id DESC';

  const purchases = rawDb.prepare(sql).all(...params) as any[];

  const result = purchases.map(pur => {
    const items = rawDb.prepare(`
      SELECT pi.*, pr.code as product_code, pr.name as product_name
      FROM purchase_items pi
      JOIN products pr ON pi.product_id = pr.id
      WHERE pi.purchase_id = ?
    `).all(pur.id);
    return { ...pur, items };
  });

  res.json(result);
});

// POST /api/purchases (Bon d'achat -> INCREASES STOCK WITH CODE 90 & SUPPLIER DEBT)
router.post('/', authenticateToken, requirePermission('achat', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = createPurchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { storeId, supplierId, items, paymentType, amountPaid } = parsed.data;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  try {
    const total = items.reduce((sum: number, it: any) => sum + (it.qty * it.unitCost), 0);

    // 1. Create Purchase
    const insertPurchase = rawDb.prepare(`
      INSERT INTO purchases (store_id, supplier_id, user_id, total, amount_paid, payment_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const purchaseRes = insertPurchase.run(storeId, supplierId, userId, total, amountPaid || 0, paymentType);
    const purchaseId = purchaseRes.lastInsertRowid;

    // 2. Insert items and update stock with CODE 90
    const insertItem = rawDb.prepare(`
      INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStock = rawDb.prepare(`
      INSERT INTO product_stock (product_id, store_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
    `);

    const insertMovement = rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'purchase', ?)
    `);

    for (const it of items) {
      insertItem.run(purchaseId, it.productId, it.qty, it.unitCost, it.qty * it.unitCost);

      // Get current stock
      const stockRow = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(it.productId, storeId) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore + it.qty;

      // Update Stock
      updateStock.run(it.productId, storeId, qtyAfter);

      // STOCK MOVEMENT CODE 90 (Achats)
      insertMovement.run(
        it.productId,
        storeId,
        STOCK_MOVEMENT_CODES.ACHAT,
        qtyBefore,
        qtyAfter,
        it.qty,
        userId,
        purchaseId
      );
    }

    // 3. Supplier Debt Tracking (if payment is credit or partial)
    const debtAmount = total - (amountPaid || 0);
    if (debtAmount > 0) {
      const insertSupplierTx = rawDb.prepare(`
        INSERT INTO supplier_transactions (supplier_id, type, amount, purchase_id, note)
        VALUES (?, 'achat', ?, ?, 'Achat bon de commande')
      `);
      insertSupplierTx.run(supplierId, debtAmount, purchaseId);
    }

    res.status(201).json({ purchaseId, total, debtAmount });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'achat', details: err.message });
  }
});

export default router;
