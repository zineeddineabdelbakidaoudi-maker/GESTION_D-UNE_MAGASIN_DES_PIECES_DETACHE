import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createClientSchema, clientVersementSchema } from '@gestion-veloo/shared';

const router = Router();

// GET /api/clients
router.get('/', authenticateToken, requirePermission('clients', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  const clients = rawDb.prepare(`
    SELECT c.*,
      COALESCE((
        SELECT SUM(CASE WHEN ct.type = 'achat' THEN ct.amount WHEN ct.type = 'versement' THEN -ct.amount ELSE 0 END)
        FROM client_transactions ct
        WHERE ct.client_id = c.id
      ), 0) as current_debt
    FROM clients c
    ORDER BY c.is_fidele DESC, c.name ASC
  `).all();

  res.json(clients);
});

// POST /api/clients
router.post('/', authenticateToken, requirePermission('clients', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { name, phone, address, isFidele, creditLimit } = parsed.data;
  const { rawDb } = getDb();

  const insert = rawDb.prepare(`
    INSERT INTO clients (name, phone, address, is_fidele, credit_limit)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = insert.run(name, phone || '', address || '', isFidele ? 1 : 0, creditLimit || 0);

  res.status(201).json({ id: result.lastInsertRowid, ...parsed.data });
});

// POST /api/clients/:id/versement
router.post('/:id/versement', authenticateToken, requirePermission('clients', 'edit'), (req: AuthRequest, res: Response) => {
  const clientId = parseInt(req.params.id, 10);
  const parsed = clientVersementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { amount, note } = parsed.data;
  const { rawDb } = getDb();

  const insert = rawDb.prepare(`
    INSERT INTO client_transactions (client_id, type, amount, note)
    VALUES (?, 'versement', ?, ?)
  `);
  const result = insert.run(clientId, amount, note || 'Versement');

  res.status(201).json({ id: result.lastInsertRowid, clientId, amount, note });
});

export default router;
