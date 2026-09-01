import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createSaleSchema, processReturnSchema } from '@gestion-veloo/shared';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';

const router = Router();

// GET /api/sales
router.get('/', authenticateToken, requirePermission('pos', 'view'), (req: AuthRequest, res: Response) => {
  const { storeId, limit = '50' } = req.query;
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  let sql = `
    SELECT s.*, c.name as client_name, u.full_name as cashier_name
    FROM sales s
    LEFT JOIN clients c ON s.client_id = c.id
    JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (storeId) {
    sql += ' AND s.store_id = ?';
    params.push(storeId);
  }
  sql += ' ORDER BY s.id DESC LIMIT ?';
  params.push(parseInt(limit as string, 10));

  const sales = rawDb.prepare(sql).all(...params) as any[];

  const result = sales.map(s => {
    const items = rawDb.prepare(`
      SELECT si.*, p.code as product_code, p.name as product_name
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(s.id);
    return { ...s, items };
  });

  res.json(result);
});

// GET /api/sales/:id (Get specific sale with all items)
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const saleId = parseInt(String(req.params.id), 10);
  const { rawDb, isPg } = getDb();
  if (isPg) return res.status(404).json({ error: 'Non supporté' });

  const sale = rawDb.prepare(`
    SELECT s.*, c.name as client_name, u.full_name as cashier_name, st.name as store_name
    FROM sales s
    LEFT JOIN clients c ON s.client_id = c.id
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN stores st ON s.store_id = st.id
    WHERE s.id = ?
  `).get(saleId) as any;

  if (!sale) {
    return res.status(404).json({ error: 'Vente non trouvée' });
  }

  const items = rawDb.prepare(`
    SELECT si.*, p.code as product_code, p.name as product_name
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = ?
  `).all(saleId);

  res.json({ ...sale, items });
});

// POST /api/sales (POS Checkout with Credit & Cash options)
router.post('/', authenticateToken, requirePermission('pos', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { storeId, clientId, items, discount, amountPaid, paymentType, cashSessionId } = parsed.data;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  try {
    const subtotal = items.reduce((sum: number, it: any) => sum + (it.qty * it.unitPrice), 0);
    const total = Math.max(0, subtotal - (discount || 0));
    const amountCredit = paymentType === 'credit' ? total : (paymentType === 'mixed' ? Math.max(0, total - (amountPaid || 0)) : 0);
    const actualAmountPaid = paymentType === 'credit' ? 0 : (paymentType === 'mixed' ? amountPaid || 0 : total);

    // 1. Create Sale Record
    const insertSale = rawDb.prepare(`
      INSERT INTO sales (store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `);
    const saleRes = insertSale.run(
      storeId,
      clientId || null,
      userId,
      cashSessionId || null,
      subtotal,
      discount || 0,
      total,
      actualAmountPaid,
      amountCredit,
      paymentType
    );
    const saleId = saleRes.lastInsertRowid;

    // 2. Insert Sale Items and Deduct Stock (Code 91)
    const insertSaleItem = rawDb.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_color_id, price_tier, qty, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = rawDb.prepare(`
      UPDATE product_stock SET quantity = quantity - ? WHERE product_id = ? AND store_id = ?
    `);

    const insertMovement = rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sale', ?)
    `);

    for (const it of items) {
      insertSaleItem.run(
        saleId,
        it.productId,
        it.productColorId || null,
        it.priceTier,
        it.qty,
        it.unitPrice,
        it.lineTotal
      );

      const stockRow = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(it.productId, storeId) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore - it.qty;

      updateStock.run(it.qty, it.productId, storeId);

      // STOCK MOVEMENT CODE 91 (Vente POS)
      insertMovement.run(
        it.productId,
        storeId,
        STOCK_MOVEMENT_CODES.VENTE,
        qtyBefore,
        qtyAfter,
        -it.qty,
        userId,
        saleId
      );
    }

    // 3. Client Credit Ledger (if not fully paid)
    if (amountCredit > 0 && clientId) {
      const insertClientTx = rawDb.prepare(`
        INSERT INTO client_transactions (client_id, type, amount, sale_id, note)
        VALUES (?, 'achat', ?, ?, 'Vente à crédit POS')
      `);
      insertClientTx.run(clientId, amountCredit, saleId);
    }

    res.status(201).json({ saleId, total, amountPaid: actualAmountPaid, amountCredit });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la validation de vente', details: err.message });
  }
});

// POST /api/sales/returns (Return Flow -> Restocks Code 92 & Client Credit Adjustment)
router.post('/returns', authenticateToken, requirePermission('pos', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = processReturnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { saleId, items } = parsed.data;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  try {
    const sale = rawDb.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
    if (!sale) return res.status(404).json({ error: 'Vente introuvable' });

    const totalRefund = items.reduce((sum: number, it: any) => sum + (it.qtyReturned * it.unitPrice), 0);

    // 1. Create Return Record
    const insertReturn = rawDb.prepare(`
      INSERT INTO returns (sale_id, store_id, user_id, total_refund)
      VALUES (?, ?, ?, ?)
    `);
    const returnRes = insertReturn.run(saleId, sale.store_id, userId, totalRefund);
    const returnId = returnRes.lastInsertRowid;

    // 2. Insert items, Restock with CODE 92
    const insertReturnItem = rawDb.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, qty_returned, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStock = rawDb.prepare(`
      UPDATE product_stock SET quantity = quantity + ? WHERE product_id = ? AND store_id = ?
    `);

    const insertMovement = rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'return', ?)
    `);

    for (const it of items) {
      const saleItem = rawDb.prepare('SELECT * FROM sale_items WHERE id = ?').get(it.saleItemId) as any;
      insertReturnItem.run(returnId, it.saleItemId, it.qtyReturned, it.unitPrice, it.qtyReturned * it.unitPrice);

      const stockRow = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(saleItem.product_id, sale.store_id) as any;
      const qtyBefore = stockRow ? stockRow.quantity : 0;
      const qtyAfter = qtyBefore + it.qtyReturned;

      updateStock.run(it.qtyReturned, saleItem.product_id, sale.store_id);

      // STOCK MOVEMENT CODE 92 (Retour Marchandise)
      insertMovement.run(
        saleItem.product_id,
        sale.store_id,
        STOCK_MOVEMENT_CODES.RETOUR,
        qtyBefore,
        qtyAfter,
        it.qtyReturned,
        userId,
        returnId
      );
    }

    // 3. Client Balance adjustment if applicable
    if (sale.client_id) {
      const insertClientTx = rawDb.prepare(`
        INSERT INTO client_transactions (client_id, type, amount, sale_id, note)
        VALUES (?, 'versement', ?, ?, 'Avoir suite au retour article')
      `);
      insertClientTx.run(sale.client_id, totalRefund, saleId);
    }

    // Mark sale status as returned
    rawDb.prepare(`UPDATE sales SET status = 'returned' WHERE id = ?`).run(saleId);

    res.status(201).json({ returnId, totalRefund });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors du traitement du retour', details: err.message });
  }
});

export default router;
