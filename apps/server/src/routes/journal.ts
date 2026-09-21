import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Journal d'audit consolidé de toutes les caisses.
 * Réservé aux profils disposant du droit de consultation sur le module `journal`
 * (le propriétaire l'a toujours).
 */

function parseIntOr(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return max ? Math.min(n, max) : n;
}

function buildFilters(req: AuthRequest) {
  const where: string[] = ['1=1'];
  const args: any[] = [];
  const q = req.query;

  // Un gérant ne voit que sa boutique ; le propriétaire voit tout.
  const scopedStore = req.user?.role === 'owner' ? (q.storeId ? Number(q.storeId) : null) : (req.user?.storeId ?? null);
  if (scopedStore) { where.push('a.store_id = ?'); args.push(scopedStore); }

  if (q.module) { where.push('a.module = ?'); args.push(String(q.module)); }
  if (q.action) { where.push('a.action = ?'); args.push(String(q.action)); }
  if (q.severity) { where.push('a.severity = ?'); args.push(String(q.severity)); }
  if (q.userId) { where.push('a.user_id = ?'); args.push(Number(q.userId)); }
  if (q.deviceId) { where.push('a.device_id = ?'); args.push(String(q.deviceId)); }
  if (q.entityType) { where.push('a.entity_type = ?'); args.push(String(q.entityType)); }
  if (q.entityId) { where.push('a.entity_id = ?'); args.push(Number(q.entityId)); }
  if (q.dateFrom) { where.push('date(a.created_at) >= date(?)'); args.push(String(q.dateFrom)); }
  if (q.dateTo) { where.push('date(a.created_at) <= date(?)'); args.push(String(q.dateTo)); }
  if (q.search) {
    where.push('(LOWER(a.summary) LIKE ? OR LOWER(COALESCE(a.user_name, \'\')) LIKE ? OR LOWER(a.action) LIKE ?)');
    const like = `%${String(q.search).toLowerCase()}%`;
    args.push(like, like, like);
  }

  return { sql: where.join(' AND '), args };
}

function mapRow(r: any) {
  const parse = (json: string | null) => {
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  };
  return {
    id: r.id,
    localId: r.local_id,
    deviceId: r.device_id,
    userId: r.user_id,
    userName: r.user_name,
    storeId: r.store_id,
    storeName: r.store_name || null,
    action: r.action,
    module: r.module,
    entityType: r.entity_type,
    entityId: r.entity_id,
    severity: r.severity,
    summary: r.summary,
    changes: parse(r.changes_json),
    metadata: parse(r.metadata_json),
    appVersion: r.app_version,
    createdAt: r.created_at,
    receivedAt: r.received_at
  };
}

// GET /api/journal
router.get('/', authenticateToken, requirePermission('journal', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json({ entries: [], total: 0, limit: 0, offset: 0 });

  try {
    const { sql, args } = buildFilters(req);
    const limit = parseIntOr(req.query.limit, 100, 1000) || 100;
    const offset = parseIntOr(req.query.offset, 0);

    const total = (rawDb.prepare(`SELECT COUNT(*) as cnt FROM audit_log a WHERE ${sql}`).get(...args) as any)?.cnt ?? 0;
    const rows = rawDb.prepare(`
      SELECT a.*, s.name as store_name
      FROM audit_log a LEFT JOIN stores s ON a.store_id = s.id
      WHERE ${sql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as any[];

    res.json({ total, limit, offset, entries: rows.map(mapRow) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal/stats
router.get('/stats', authenticateToken, requirePermission('journal', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json({});

  try {
    const scope = req.user?.role === 'owner' ? null : (req.user?.storeId ?? null);
    const filter = scope ? 'WHERE store_id = ?' : '';
    const args = scope ? [scope] : [];

    const bySeverity = rawDb.prepare(`SELECT severity, COUNT(*) cnt FROM audit_log ${filter} GROUP BY severity`).all(...args) as any[];
    const byModule = rawDb.prepare(`SELECT module, COUNT(*) cnt FROM audit_log ${filter} GROUP BY module ORDER BY cnt DESC LIMIT 10`).all(...args);
    const topActors = rawDb.prepare(`
      SELECT user_name as userName, COUNT(*) cnt FROM audit_log
      ${filter ? filter + ' AND' : 'WHERE'} created_at >= datetime('now', '-30 days')
      GROUP BY user_id ORDER BY cnt DESC LIMIT 5
    `).all(...args);
    const today = rawDb.prepare(`
      SELECT COUNT(*) cnt FROM audit_log
      ${filter ? filter + ' AND' : 'WHERE'} date(created_at) = date('now')
    `).get(...args) as any;
    const total = (rawDb.prepare(`SELECT COUNT(*) cnt FROM audit_log ${filter}`).get(...args) as any)?.cnt ?? 0;

    const devices = rawDb.prepare(`
      SELECT device_id as deviceId, store_id as storeId, app_version as appVersion,
             last_seen_at as lastSeenAt, total_batches as totalBatches
      FROM sync_devices ORDER BY last_seen_at DESC
    `).all();

    const lastBatches = rawDb.prepare(`
      SELECT id, device_id as deviceId, store_id as storeId, authenticated, counts_json as countsJson, received_at as receivedAt
      FROM sync_batches ORDER BY id DESC LIMIT 20
    `).all() as any[];

    res.json({
      total,
      today: today?.cnt ?? 0,
      bySeverity: bySeverity.reduce((acc: Record<string, number>, r: any) => { acc[r.severity] = r.cnt; return acc; }, {}),
      byModule,
      topActors,
      devices,
      lastBatches: lastBatches.map(b => ({
        ...b,
        authenticated: Boolean(b.authenticated),
        counts: (() => { try { return JSON.parse(b.countsJson); } catch { return null; } })()
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal/filters
router.get('/filters', authenticateToken, requirePermission('journal', 'view'), (_req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json({ modules: [], actions: [], users: [], devices: [] });

  try {
    res.json({
      modules: (rawDb.prepare('SELECT DISTINCT module FROM audit_log ORDER BY module').all() as any[]).map(r => r.module),
      actions: (rawDb.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all() as any[]).map(r => r.action),
      users: rawDb.prepare('SELECT DISTINCT user_id as id, user_name as name FROM audit_log WHERE user_id IS NOT NULL ORDER BY user_name').all(),
      devices: (rawDb.prepare('SELECT DISTINCT device_id FROM audit_log ORDER BY device_id').all() as any[]).map(r => r.device_id)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal/cost-history — traçabilité de la règle de prix d'achat
router.get('/cost-history', authenticateToken, requirePermission('journal', 'view'), (req: AuthRequest, res: Response) => {
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json([]);

  try {
    const args: any[] = [];
    let sql = `
      SELECT h.*, p.code as productCode, p.name as productName, s.name as storeName
      FROM product_cost_history h
      LEFT JOIN products p ON h.product_id = p.id
      LEFT JOIN stores s ON h.store_id = s.id
      WHERE 1=1
    `;
    if (req.query.productId) { sql += ' AND h.product_id = ?'; args.push(Number(req.query.productId)); }
    if (req.query.strategy) { sql += ' AND h.strategy = ?'; args.push(String(req.query.strategy)); }
    sql += ' ORDER BY h.created_at DESC, h.id DESC LIMIT ?';
    args.push(parseIntOr(req.query.limit, 200, 1000) || 200);

    res.json(rawDb.prepare(sql).all(...args));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
