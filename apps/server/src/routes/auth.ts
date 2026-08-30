import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';
import { loginSchema } from '@gestion-veloo/shared';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-algeria-pos-2026';

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Données invalides', details: parseResult.error.errors });
  }

  const { username, password } = parseResult.data;
  const { rawDb, isPg } = getDb();

  try {
    if (isPg) {
      // Postgres implementation
      return res.status(501).json({ error: 'Postgres auth in progress' });
    }

    const user = rawDb.prepare(`
      SELECT * FROM users WHERE username = ? AND is_active = 1
    `).get(username) as any;

    if (!user) {
      return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
    }

    // Fetch user permissions
    const permissions = rawDb.prepare(`
      SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?
    `).all(user.id) as any[];

    // Fetch store info if assigned
    let store = null;
    if (user.store_id) {
      store = rawDb.prepare('SELECT * FROM stores WHERE id = ?').get(user.store_id);
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.store_id
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        username: user.username,
        role: user.role,
        storeId: user.store_id,
        store,
        permissions: permissions.map(p => ({
          module: p.module,
          canView: Boolean(p.can_view),
          canEdit: Boolean(p.can_edit)
        }))
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur lors de la connexion', details: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg || !req.user) {
    return res.json({ user: req.user });
  }

  const user = rawDb.prepare('SELECT id, full_name, username, role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const permissions = rawDb.prepare('SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?').all(user.id) as any[];

  res.json({
    user: {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      role: user.role,
      storeId: user.store_id,
      permissions: permissions.map(p => ({
        module: p.module,
        canView: Boolean(p.can_view),
        canEdit: Boolean(p.can_edit)
      }))
    }
  });
});

export default router;
