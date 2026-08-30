import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db';
import { SystemModule } from '@gestion-veloo/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-algeria-pos-2026';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
    storeId?: number;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'authentification requis' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET) as any;
    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expiré' });
  }
}

export function requirePermission(moduleName: SystemModule, action: 'view' | 'edit') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (req.user.role === 'owner') {
      return next(); // Owner has full access
    }

    const { rawDb, isPg } = getDb();
    const userId = req.user.id;

    let canAccess = false;
    if (isPg) {
      // Postgres check (async handler will wrap)
      next();
      return;
    } else {
      const permRow = rawDb.prepare(`
        SELECT can_view, can_edit 
        FROM permissions 
        WHERE user_id = ? AND module = ?
      `).get(userId, moduleName) as any;

      if (permRow) {
        canAccess = action === 'view' ? Boolean(permRow.can_view) : Boolean(permRow.can_edit);
      }
    }

    if (!canAccess) {
      return res.status(403).json({ 
        error: `Accès refusé. Permission '${action}' manquante pour le module '${moduleName}'.` 
      });
    }

    next();
  };
}
