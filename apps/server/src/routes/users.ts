import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createUserSchema, updateUserPermissionsSchema } from '@gestion-veloo/shared';
import { SYSTEM_MODULES } from '@gestion-veloo/shared';

const router = Router();

// GET /api/users (List all users with their permissions matrix)
router.get('/', authenticateToken, requirePermission('users', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  const users = rawDb.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.store_id, u.created_at,
           s.name as store_name
    FROM users u
    LEFT JOIN stores s ON u.store_id = s.id
    ORDER BY u.id ASC
  `).all() as any[];

  const result = users.map(u => {
    const permissions = rawDb.prepare(`
      SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?
    `).all(u.id);
    return { ...u, permissions };
  });

  res.json(result);
});

// POST /api/users (Create user with initial permissions)
router.post('/', authenticateToken, requirePermission('users', 'edit'), async (req: AuthRequest, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { username, password, fullName, role, storeId, permissions } = parsed.data;
  const { rawDb } = getDb();

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const insertUser = rawDb.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, store_id, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const userRes = insertUser.run(username, passwordHash, fullName, role, storeId || null);
    const userId = userRes.lastInsertRowid;

    // Set Permissions
    const insertPerm = rawDb.prepare(`
      INSERT INTO permissions (user_id, module, can_view, can_edit)
      VALUES (?, ?, ?, ?)
    `);

    for (const mod of SYSTEM_MODULES) {
      const p = permissions?.find(item => item.module === mod);
      const canView = role === 'owner' ? 1 : (p ? (p.canView ? 1 : 0) : 0);
      const canEdit = role === 'owner' ? 1 : (p ? (p.canEdit ? 1 : 0) : 0);
      insertPerm.run(userId, mod, canView, canEdit);
    }

    res.status(201).json({ id: userId, username, fullName, role, storeId });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur', details: err.message });
  }
});

// PUT /api/users/:id/permissions (Update 10-module permission matrix)
router.put('/:id/permissions', authenticateToken, requirePermission('users', 'edit'), (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);
  const parsed = updateUserPermissionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { permissions } = parsed.data;
  const { rawDb } = getDb();

  try {
    const upsertPerm = rawDb.prepare(`
      INSERT INTO permissions (user_id, module, can_view, can_edit)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, module) DO UPDATE SET
        can_view = excluded.can_view,
        can_edit = excluded.can_edit
    `);

    for (const p of permissions) {
      upsertPerm.run(userId, p.module, p.canView ? 1 : 0, p.canEdit ? 1 : 0);
    }

    res.json({ success: true, userId, permissions });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour des permissions', details: err.message });
  }
});

// PUT /api/users/:id/toggle-active
router.put('/:id/toggle-active', authenticateToken, requirePermission('users', 'edit'), (req: AuthRequest, res: Response) => {
  const userId = parseInt(String(req.params.id), 10);
  const { rawDb } = getDb();

  try {
    const user = rawDb.prepare('SELECT is_active FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const newStatus = user.is_active ? 0 : 1;
    rawDb.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, userId);

    res.json({ success: true, userId, isActive: newStatus === 1 });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut', details: err.message });
  }
});

export default router;
