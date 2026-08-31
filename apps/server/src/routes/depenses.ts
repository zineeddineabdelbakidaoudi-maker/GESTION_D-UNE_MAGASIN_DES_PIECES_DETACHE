import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/depenses/categories
router.get('/categories', authenticateToken, (_req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);
  const cats = rawDb.prepare('SELECT * FROM expense_categories ORDER BY id ASC').all();
  res.json(cats);
});

// GET /api/depenses
router.get('/', authenticateToken, requirePermission('depenses', 'view'), (req: AuthRequest, res: Response) => {
  const { storeId, categoryId, dateFrom, dateTo } = req.query;
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  let sql = `
    SELECT d.*, ec.name as category_name, u.full_name as user_full_name, st.name as store_name
    FROM depenses d
    JOIN expense_categories ec ON d.category_id = ec.id
    JOIN users u ON d.user_id = u.id
    JOIN stores st ON d.store_id = st.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (storeId) { sql += ' AND d.store_id = ?'; params.push(storeId); }
  if (categoryId) { sql += ' AND d.category_id = ?'; params.push(categoryId); }
  if (dateFrom) { sql += ' AND date(d.depense_date) >= date(?)'; params.push(dateFrom); }
  if (dateTo) { sql += ' AND date(d.depense_date) <= date(?)'; params.push(dateTo); }
  sql += ' ORDER BY d.id DESC';

  const rows = rawDb.prepare(sql).all(...params);
  res.json(rows);
});

// POST /api/depenses
router.post('/', authenticateToken, requirePermission('depenses', 'edit'), (req: AuthRequest, res: Response) => {
  const { storeId, categoryId, amount, note, depenseDate } = req.body;
  const { rawDb } = getDb();
  const userId = req.user?.id || 1;

  if (!categoryId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Catégorie et montant valide obligatoires' });
  }

  try {
    const resInsert = rawDb.prepare(`
      INSERT INTO depenses (store_id, category_id, amount, note, user_id, depense_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(storeId || 1, categoryId, amount, note || '', userId, depenseDate || new Date().toISOString());

    res.status(201).json({ id: resInsert.lastInsertRowid, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/depenses/:id
router.delete('/:id', authenticateToken, requirePermission('depenses', 'edit'), (req: AuthRequest, res: Response) => {
  const { rawDb } = getDb();
  try {
    rawDb.prepare('DELETE FROM depenses WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
