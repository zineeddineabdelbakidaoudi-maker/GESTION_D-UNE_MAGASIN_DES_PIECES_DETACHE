import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';

const router = Router();

const handleStockMovements = (req: AuthRequest, res: Response) => {
  const { storeId, movementCode, code, productId, limit = '100', offset = '0' } = req.query;
  const targetCode = code || movementCode;
  const { rawDb, isPg } = getDb();

  if (isPg) {
    res.json([]);
    return;
  }

  let sql = `
    SELECT sm.id, sm.product_id as productId, sm.store_id as storeId, sm.movement_code as movementCode,
           sm.qty_before as qtyBefore, sm.qty_after as qtyAfter, sm.delta, sm.user_id as userId,
           sm.ref_type as refType, sm.ref_id as refId, sm.created_at as createdAt,
           p.code as productCode, p.name as productName,
           u.full_name as userName,
           s.name as storeName
    FROM stock_movements sm
    LEFT JOIN products p ON sm.product_id = p.id
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN stores s ON sm.store_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (storeId) {
    sql += ' AND sm.store_id = ?';
    params.push(storeId);
  }
  if (targetCode) {
    sql += ' AND sm.movement_code = ?';
    params.push(targetCode);
  }
  if (productId) {
    sql += ' AND sm.product_id = ?';
    params.push(productId);
  }

  sql += ' ORDER BY sm.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  try {
    const rows = rawDb.prepare(sql).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/audit/movements & /api/audit/stock-movements
router.get('/movements', authenticateToken, requirePermission('stock', 'view'), handleStockMovements);
router.get('/stock-movements', authenticateToken, requirePermission('stock', 'view'), handleStockMovements);

// GET /api/audit/activities (Log of user actions)
router.get('/activities', authenticateToken, requirePermission('rapport', 'view'), (req: AuthRequest, res: Response) => {
  const { userId, module, limit = '50' } = req.query;
  const { rawDb, isPg } = getDb();

  if (isPg) {
    res.json([]);
    return;
  }

  let sql = `
    SELECT al.*, u.full_name as user_full_name, u.username
    FROM activity_logs al
    JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (userId) {
    sql += ' AND al.user_id = ?';
    params.push(userId);
  }
  if (module) {
    sql += ' AND al.module = ?';
    params.push(module);
  }

  sql += ' ORDER BY al.id DESC LIMIT ?';
  params.push(parseInt(limit as string, 10));

  const rows = rawDb.prepare(sql).all(...params);
  res.json(rows);
});

export default router;
