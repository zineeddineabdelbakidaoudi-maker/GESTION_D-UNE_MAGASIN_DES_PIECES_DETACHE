import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';
import { adjustStockSchema, transferStockSchema } from '@gestion-veloo/shared';

const router = Router();

// GET /api/stock (Overview per store, with CODE 90 latest check)
router.get('/', authenticateToken, requirePermission('stock', 'view'), (req: AuthRequest, res: Response) => {
  const { storeId, q } = req.query;
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  let sql = `
    SELECT p.id as product_id, p.code as product_code, p.name as product_name,
           p.price_achat, p.price_detail,
           c.name as category_name, b.name as brand_name,
           ps.store_id, s.name as store_name, ps.quantity
    FROM products p
    JOIN product_stock ps ON p.id = ps.product_id
    JOIN stores s ON ps.store_id = s.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (storeId) {
    sql += ' AND ps.store_id = ?';
    params.push(storeId);
  }
  if (q) {
    sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(b.name) LIKE ?)';
    const like = `%${(q as string).toLowerCase()}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY p.id DESC';

  const stockRows = rawDb.prepare(sql).all(...params) as any[];

  // Attach latest movement info (for Code 90 highlighting)
  const result = stockRows.map(r => {
    const lastMovement = rawDb.prepare(`
      SELECT movement_code, qty_before, qty_after, delta, created_at
      FROM stock_movements
      WHERE product_id = ? AND store_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(r.product_id, r.store_id) as any;

    const isCode90Recent = lastMovement?.movement_code === STOCK_MOVEMENT_CODES.ACHAT;

    return {
      ...r,
      lastMovementCode: lastMovement?.movement_code || null,
      isCode90Recent,
      recentQtyBefore: isCode90Recent ? lastMovement.qty_before : null,
      recentQtyAfter: isCode90Recent ? lastMovement.qty_after : null,
      lastMovementDate: lastMovement?.created_at || null
    };
  });

  res.json(result);
});

// POST /api/stock/adjust (Manual Stock Adjustment - CODE 93)
router.post('/adjust', authenticateToken, requirePermission('stock', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = adjustStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { productId, storeId, newQuantity, note } = parsed.data;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  try {
    const current = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, storeId) as any;
    const qtyBefore = current ? current.quantity : 0;
    const delta = newQuantity - qtyBefore;

    rawDb.prepare(`
      INSERT INTO product_stock (product_id, store_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
    `).run(productId, storeId, newQuantity);

    // CODE 93 (Ajustement Inventaire)
    rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'adjustment', NULL)
    `).run(productId, storeId, STOCK_MOVEMENT_CODES.AJUSTEMENT, qtyBefore, newQuantity, delta, userId);

    res.json({ success: true, productId, storeId, qtyBefore, newQuantity, delta, note });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de l\'ajustement', details: err.message });
  }
});

// POST /api/stock/transfer (Inter-Store Transfer - CODES 94 & 95)
router.post('/transfer', authenticateToken, requirePermission('stock', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = transferStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { fromStoreId, toStoreId, productId, qty, note } = parsed.data;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  try {
    const sourceStock = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, fromStoreId) as any;
    const currentSourceQty = sourceStock ? sourceStock.quantity : 0;

    if (currentSourceQty < qty) {
      return res.status(400).json({ error: `Stock source insuffisant (${currentSourceQty} dispo)` });
    }

    const destStock = rawDb.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, toStoreId) as any;
    const currentDestQty = destStock ? destStock.quantity : 0;

    const newSourceQty = currentSourceQty - qty;
    const newDestQty = currentDestQty + qty;

    // Update both stores
    rawDb.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = ?').run(newSourceQty, productId, fromStoreId);
    rawDb.prepare(`
      INSERT INTO product_stock (product_id, store_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
    `).run(productId, toStoreId, newDestQty);

    // Record Transfer Record
    const insertTransfer = rawDb.prepare(`
      INSERT INTO stock_transfers (from_store_id, to_store_id, product_id, qty, user_id, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const transferRes = insertTransfer.run(fromStoreId, toStoreId, productId, qty, userId, note || null);
    const transferId = transferRes.lastInsertRowid;

    // CODE 94: Transfert Sortant (From Source)
    rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer', ?)
    `).run(productId, fromStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_SORTANT, currentSourceQty, newSourceQty, -qty, userId, transferId);

    // CODE 95: Transfert Entrant (To Destination)
    rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'transfer', ?)
    `).run(productId, toStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_ENTRANT, currentDestQty, newDestQty, qty, userId, transferId);

    res.status(201).json({ transferId, productId, fromStoreId, toStoreId, qty });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors du transfert', details: err.message });
  }
});

export default router;
