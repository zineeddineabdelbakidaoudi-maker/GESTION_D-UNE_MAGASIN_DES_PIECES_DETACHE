import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';

const router = Router();

// GET /api/audit/movements (With Code 90 filter & before/after quantities)
router.get('/movements', authenticateToken, requirePermission('stock', 'view'), (req: AuthRequest, res: Response) => {
  const { storeId, movementCode, productId, limit = '50', offset = '0' } = req.query;
  const { rawDb, isPg } = getDb();

  if (isPg) {
    res.json([]);
    return;
  }

  let sql = `
    SELECT sm.*, 
           p.code as product_code, p.name as product_name,
           u.full_name as user_full_name,
           s.name as store_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    JOIN users u ON sm.user_id = u.id
    JOIN stores s ON sm.store_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (storeId) {
    sql += ' AND sm.store_id = ?';
    params.push(storeId);
  }
  if (movementCode) {
    sql += ' AND sm.movement_code = ?';
    params.push(movementCode);
  }
  if (productId) {
    sql += ' AND sm.product_id = ?';
    params.push(productId);
  }

  sql += ' ORDER BY sm.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const rows = rawDb.prepare(sql).all(...params);
  res.json(rows);
});

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
