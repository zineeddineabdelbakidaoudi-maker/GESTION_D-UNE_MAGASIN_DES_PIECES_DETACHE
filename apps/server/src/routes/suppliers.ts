import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createSupplierSchema, supplierVersementSchema } from '@gestion-veloo/shared';

const router = Router();

// GET /api/suppliers
router.get('/', authenticateToken, requirePermission('fournisseurs', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  const suppliers = rawDb.prepare(`
    SELECT s.*,
      COALESCE((
        SELECT SUM(CASE WHEN st.type = 'achat' THEN st.amount WHEN st.type = 'versement' THEN -st.amount ELSE 0 END)
        FROM supplier_transactions st
        WHERE st.supplier_id = s.id
      ), 0) as current_debt
    FROM suppliers s
    ORDER BY s.name ASC
  `).all();

  res.json(suppliers);
});

// POST /api/suppliers
router.post('/', authenticateToken, requirePermission('fournisseurs', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = createSupplierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { name, phone, address } = parsed.data;
  const { rawDb } = getDb();

  const insert = rawDb.prepare(`
    INSERT INTO suppliers (name, phone, address)
    VALUES (?, ?, ?)
  `);
  const result = insert.run(name, phone || '', address || '');

  res.status(201).json({ id: result.lastInsertRowid, ...parsed.data });
});

// POST /api/suppliers/:id/versement
router.post('/:id/versement', authenticateToken, requirePermission('fournisseurs', 'edit'), (req: AuthRequest, res: Response) => {
  const supplierId = parseInt(String(req.params.id), 10);
  const parsed = supplierVersementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { amount, note } = parsed.data;
  const { rawDb } = getDb();

  const insert = rawDb.prepare(`
    INSERT INTO supplier_transactions (supplier_id, type, amount, note)
    VALUES (?, 'versement', ?, ?)
  `);
  const result = insert.run(supplierId, amount, note || 'Règlement');

  res.status(201).json({ id: result.lastInsertRowid, supplierId, amount, note });
});

export default router;
