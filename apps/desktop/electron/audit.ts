import type Database from 'better-sqlite3';
import { severityOf, type AuditFieldChange, type AuditSeverity } from '@gestion-veloo/shared';
import { getLocalDb, getDeviceId } from './db';

const APP_VERSION = process.env.npm_package_version || '2.0.0';

export interface AuditActor {
  id: number | null;
  fullName?: string | null;
  username?: string | null;
  storeId?: number | null;
}

export interface AuditInput {
  actor: AuditActor | null;
  action: string;
  module: string;
  summary: string;
  entityType?: string | null;
  entityId?: number | string | null;
  changes?: AuditFieldChange[] | null;
  metadata?: Record<string, unknown> | null;
  severity?: AuditSeverity;
  storeId?: number | null;
}

/**
 * Journal en ajout seul. Aucune écriture d'audit ne doit pouvoir faire échouer
 * l'opération métier qu'elle décrit : toute erreur est capturée et tracée en console.
 */
export function recordAudit(input: AuditInput, conn?: Database.Database): number | null {
  try {
    const db = conn || getLocalDb();
    const entityId = typeof input.entityId === 'string' ? Number(input.entityId) : input.entityId;

    const res = db
      .prepare(
        `INSERT INTO audit_log
          (user_id, user_name, store_id, action, module, entity_type, entity_id, severity, summary, changes_json, metadata_json, device_id, app_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.actor?.id ?? null,
        input.actor?.fullName || input.actor?.username || 'Système',
        input.storeId ?? input.actor?.storeId ?? null,
        input.action,
        input.module,
        input.entityType ?? null,
        Number.isFinite(entityId as number) ? entityId : null,
        input.severity || severityOf(input.action),
        input.summary,
        input.changes && input.changes.length ? JSON.stringify(input.changes) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        getDeviceIdSafe(),
        APP_VERSION
      );

    return Number(res.lastInsertRowid);
  } catch (err) {
    console.error('[audit] écriture impossible:', (err as Error).message, input.action);
    return null;
  }
}

function getDeviceIdSafe(): string {
  try {
    return getDeviceId();
  } catch {
    return 'POS-UNKNOWN';
  }
}

export interface AuditQuery {
  search?: string;
  module?: string;
  action?: string;
  severity?: string;
  userId?: number;
  storeId?: number;
  entityType?: string;
  entityId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export function queryAudit(params: AuditQuery = {}) {
  const db = getLocalDb();
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const offset = Math.max(params.offset ?? 0, 0);

  const where: string[] = ['1=1'];
  const args: any[] = [];

  if (params.module) { where.push('a.module = ?'); args.push(params.module); }
  if (params.action) { where.push('a.action = ?'); args.push(params.action); }
  if (params.severity) { where.push('a.severity = ?'); args.push(params.severity); }
  if (params.userId) { where.push('a.user_id = ?'); args.push(params.userId); }
  if (params.storeId) { where.push('a.store_id = ?'); args.push(params.storeId); }
  if (params.entityType) { where.push('a.entity_type = ?'); args.push(params.entityType); }
  if (params.entityId) { where.push('a.entity_id = ?'); args.push(params.entityId); }
  if (params.dateFrom) { where.push('date(a.created_at) >= date(?)'); args.push(params.dateFrom); }
  if (params.dateTo) { where.push('date(a.created_at) <= date(?)'); args.push(params.dateTo); }
  if (params.search) {
    where.push('(LOWER(a.summary) LIKE ? OR LOWER(a.user_name) LIKE ? OR LOWER(a.action) LIKE ? OR LOWER(COALESCE(a.metadata_json, \'\')) LIKE ?)');
    const like = `%${params.search.toLowerCase()}%`;
    args.push(like, like, like, like);
  }

  const whereSql = where.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM audit_log a WHERE ${whereSql}`).get(...args) as any)?.cnt ?? 0;

  const rows = db
    .prepare(
      `SELECT a.*, s.name as store_name
       FROM audit_log a
       LEFT JOIN stores s ON a.store_id = s.id
       WHERE ${whereSql}
       ORDER BY a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as any[];

  return {
    total,
    limit,
    offset,
    entries: rows.map(mapAuditRow)
  };
}

export function mapAuditRow(r: any) {
  return {
    id: r.id,
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
    changes: safeParse(r.changes_json) as AuditFieldChange[] | null,
    metadata: safeParse(r.metadata_json) as Record<string, unknown> | null,
    deviceId: r.device_id,
    appVersion: r.app_version,
    syncedAt: r.synced_at || null,
    createdAt: r.created_at
  };
}

function safeParse(json: string | null | undefined) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Statistiques du journal pour l'en-tête du tableau de bord d'audit. */
export function auditStats(storeId?: number) {
  const db = getLocalDb();
  const filter = storeId ? 'AND store_id = ?' : '';
  const args = storeId ? [storeId] : [];

  const bySeverity = db
    .prepare(`SELECT severity, COUNT(*) as cnt FROM audit_log WHERE 1=1 ${filter} GROUP BY severity`)
    .all(...args) as any[];

  const today = db
    .prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE date(created_at) = date('now') ${filter}`)
    .get(...args) as any;

  const pendingSync = db
    .prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE synced_at IS NULL ${filter}`)
    .get(...args) as any;

  const failedLogins = db
    .prepare(`SELECT COUNT(*) as cnt FROM login_attempts WHERE success = 0 AND created_at >= datetime('now', '-7 days')`)
    .get() as any;

  const topActors = db
    .prepare(
      `SELECT user_id as userId, user_name as userName, COUNT(*) as cnt
       FROM audit_log WHERE created_at >= datetime('now', '-30 days') ${filter}
       GROUP BY user_id ORDER BY cnt DESC LIMIT 5`
    )
    .all(...args);

  return {
    total: (db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE 1=1 ${filter}`).get(...args) as any)?.cnt ?? 0,
    today: today?.cnt ?? 0,
    pendingSync: pendingSync?.cnt ?? 0,
    failedLogins7d: failedLogins?.cnt ?? 0,
    bySeverity: bySeverity.reduce((acc: Record<string, number>, r: any) => {
      acc[r.severity] = r.cnt;
      return acc;
    }, {}),
    topActors
  };
}
