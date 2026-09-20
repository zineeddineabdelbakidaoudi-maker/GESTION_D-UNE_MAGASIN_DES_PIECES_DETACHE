import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  can,
  DEFAULT_ROLE_PERMISSIONS,
  permissionMatrixToRows,
  SYSTEM_MODULES,
  USER_ROLES,
  type SystemModule,
  type UserRole
} from '@gestion-veloo/shared';
import { getLocalDb } from './db';
import { recordAudit } from './audit';

/** Verrouillage temporaire après plusieurs échecs consécutifs. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MINUTES = 15;
/** Déconnexion automatique après inactivité prolongée (protection du poste de caisse). */
export const IDLE_TIMEOUT_MINUTES = 60;

export interface SessionPermission {
  module: SystemModule;
  canView: boolean;
  canEdit: boolean;
}

export interface Session {
  token: string;
  userId: number;
  username: string;
  fullName: string;
  role: UserRole;
  storeId: number | null;
  permissions: SessionPermission[];
  mustChangePassword: boolean;
  startedAt: number;
  lastSeenAt: number;
}

/**
 * Les sessions vivent uniquement dans le process principal, indexées par
 * l'identifiant du webContents. Le renderer ne détient jamais de secret
 * exploitable et ne peut donc pas se fabriquer des droits.
 */
const sessions = new Map<number, Session>();

export class AuthError extends Error {
  code: string;
  constructor(message: string, code = 'AUTH_REQUIRED') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export class PermissionError extends Error {
  code = 'FORBIDDEN';
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

function loadPermissions(userId: number): SessionPermission[] {
  const db = getLocalDb();
  const rows = db.prepare('SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?').all(userId) as any[];
  const known = new Set<string>(SYSTEM_MODULES);
  return rows
    .filter(r => known.has(r.module))
    .map(r => ({ module: r.module as SystemModule, canView: Boolean(r.can_view), canEdit: Boolean(r.can_edit) }));
}

function normalizeRole(role: string | null | undefined): UserRole {
  return (USER_ROLES as readonly string[]).includes(role || '') ? (role as UserRole) : 'cashier';
}

export interface LoginResult {
  session: Omit<Session, 'token'> & { token: string };
  store: any | null;
  stores: any[];
}

export function login(webContentsId: number, username: string, password: string): LoginResult {
  const db = getLocalDb();
  const uname = String(username || '').trim().toLowerCase();
  const pwd = String(password || '');

  const recordAttempt = (success: boolean, reason: string) => {
    try {
      db.prepare('INSERT INTO login_attempts (username, success, reason) VALUES (?, ?, ?)').run(uname, success ? 1 : 0, reason);
    } catch {}
  };

  if (!uname || !pwd) {
    recordAttempt(false, 'champs_vides');
    throw new AuthError('Identifiant et mot de passe obligatoires.', 'INVALID_CREDENTIALS');
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(uname) as any;

  if (!user) {
    recordAttempt(false, 'utilisateur_inconnu');
    recordAudit({
      actor: null,
      action: 'auth.login.failed',
      module: 'users',
      summary: `Tentative de connexion avec un identifiant inconnu : « ${uname} »`,
      metadata: { username: uname }
    });
    // Message volontairement identique au mot de passe faux : on n'indique jamais
    // si un compte existe.
    throw new AuthError('Identifiant ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    recordAttempt(false, 'compte_desactive');
    recordAudit({
      actor: { id: user.id, fullName: user.full_name, username: user.username, storeId: user.store_id },
      action: 'auth.login.failed',
      module: 'users',
      summary: `Connexion refusée : le compte « ${user.username} » est désactivé.`,
      severity: 'warning'
    });
    throw new AuthError('Ce compte est désactivé. Contactez le propriétaire.', 'ACCOUNT_DISABLED');
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    recordAttempt(false, 'compte_verrouille');
    throw new AuthError(`Compte verrouillé. Réessayez dans ${minutes} minute(s).`, 'ACCOUNT_LOCKED');
  }

  if (!bcrypt.compareSync(pwd, user.password_hash)) {
    const failed = (user.failed_attempts || 0) + 1;
    const shouldLock = failed >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString() : null;

    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(failed, lockedUntil, user.id);
    recordAttempt(false, 'mot_de_passe_invalide');
    recordAudit({
      actor: { id: user.id, fullName: user.full_name, username: user.username, storeId: user.store_id },
      action: shouldLock ? 'auth.locked' : 'auth.login.failed',
      module: 'users',
      summary: shouldLock
        ? `Compte « ${user.username} » verrouillé ${LOCK_DURATION_MINUTES} min après ${failed} échecs consécutifs.`
        : `Mot de passe incorrect pour « ${user.username} » (tentative ${failed}/${MAX_FAILED_ATTEMPTS}).`,
      metadata: { failedAttempts: failed }
    });

    if (shouldLock) {
      throw new AuthError(
        `Trop de tentatives. Compte verrouillé pendant ${LOCK_DURATION_MINUTES} minutes.`,
        'ACCOUNT_LOCKED'
      );
    }
    throw new AuthError('Identifiant ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  const role = normalizeRole(user.role);
  const session: Session = {
    token: crypto.randomBytes(24).toString('hex'),
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    role,
    storeId: user.store_id ?? null,
    permissions: loadPermissions(user.id),
    mustChangePassword: Boolean(user.must_change_password),
    startedAt: Date.now(),
    lastSeenAt: Date.now()
  };

  sessions.set(webContentsId, session);
  recordAttempt(true, 'ok');

  const stores = db.prepare('SELECT * FROM stores ORDER BY id ASC').all() as any[];
  const store = session.storeId ? stores.find(s => s.id === session.storeId) || null : stores[0] || null;

  recordAudit({
    actor: { id: user.id, fullName: user.full_name, username: user.username, storeId: user.store_id },
    action: 'auth.login.success',
    module: 'users',
    summary: `Connexion de ${user.full_name} (${role}).`,
    storeId: store?.id ?? null,
    metadata: { role, storeId: store?.id ?? null }
  });

  return { session, store, stores };
}

export function logout(webContentsId: number): void {
  const session = sessions.get(webContentsId);
  if (session) {
    recordAudit({
      actor: sessionActor(session),
      action: 'auth.logout',
      module: 'users',
      summary: `Déconnexion de ${session.fullName}.`,
      storeId: session.storeId
    });
  }
  sessions.delete(webContentsId);
}

export function clearSessionFor(webContentsId: number): void {
  sessions.delete(webContentsId);
}

export function peekSession(webContentsId: number): Session | null {
  return sessions.get(webContentsId) || null;
}

/** Renvoie la session active, en appliquant le délai d'inactivité. */
export function requireSession(webContentsId: number): Session {
  const session = sessions.get(webContentsId);
  if (!session) {
    throw new AuthError('Session expirée. Veuillez vous reconnecter.');
  }

  if (Date.now() - session.lastSeenAt > IDLE_TIMEOUT_MINUTES * 60000) {
    sessions.delete(webContentsId);
    recordAudit({
      actor: sessionActor(session),
      action: 'auth.logout',
      module: 'users',
      summary: `Déconnexion automatique de ${session.fullName} après ${IDLE_TIMEOUT_MINUTES} min d'inactivité.`,
      severity: 'notice',
      storeId: session.storeId
    });
    throw new AuthError('Session expirée pour inactivité. Veuillez vous reconnecter.', 'SESSION_IDLE');
  }

  session.lastSeenAt = Date.now();
  return session;
}

export function sessionActor(session: Session) {
  return { id: session.userId, fullName: session.fullName, username: session.username, storeId: session.storeId };
}

export function assertPermission(session: Session, moduleName: SystemModule, action: 'view' | 'edit'): void {
  if (can(session, moduleName, action)) return;

  recordAudit({
    actor: sessionActor(session),
    action: 'access.denied',
    module: moduleName,
    summary: `${session.fullName} a tenté une action « ${action} » sur le module « ${moduleName} » sans autorisation.`,
    severity: 'critical',
    storeId: session.storeId,
    metadata: { module: moduleName, action, role: session.role }
  });

  throw new PermissionError(
    `Accès refusé : votre profil « ${session.role} » ne permet pas de ${action === 'edit' ? 'modifier' : 'consulter'} le module « ${moduleName} ».`
  );
}

/**
 * Un caissier ne travaille que sur sa boutique. Le propriétaire et l'auditeur
 * voient toutes les boutiques ; le gérant est limité à la sienne si elle est définie.
 */
export function resolveStoreScope(session: Session, requestedStoreId?: number | null): number | null {
  if (session.role === 'owner' || session.role === 'auditor') {
    return requestedStoreId ?? null;
  }
  if (session.storeId == null) return requestedStoreId ?? null;
  if (requestedStoreId && requestedStoreId !== session.storeId) {
    throw new PermissionError('Accès refusé : vous ne pouvez consulter que votre propre boutique.');
  }
  return session.storeId;
}

/** Boutique sur laquelle une écriture est autorisée (jamais nulle). */
export function requireWritableStore(session: Session, requestedStoreId?: number | null): number {
  if (session.role === 'owner') {
    const storeId = requestedStoreId ?? session.storeId ?? 1;
    return storeId;
  }
  if (session.storeId == null) {
    if (!requestedStoreId) throw new PermissionError('Aucune boutique affectée à votre compte.');
    return requestedStoreId;
  }
  if (requestedStoreId && requestedStoreId !== session.storeId) {
    throw new PermissionError('Accès refusé : opération sur une autre boutique que la vôtre.');
  }
  return session.storeId;
}

export function refreshSessionPermissions(userId: number): void {
  for (const [wcId, session] of sessions.entries()) {
    if (session.userId !== userId) continue;
    const db = getLocalDb();
    const user = db.prepare('SELECT role, is_active, store_id FROM users WHERE id = ?').get(userId) as any;
    if (!user || !user.is_active) {
      sessions.delete(wcId);
      continue;
    }
    session.role = normalizeRole(user.role);
    session.storeId = user.store_id ?? null;
    session.permissions = loadPermissions(userId);
  }
}

export function changePassword(session: Session, currentPassword: string, newPassword: string): void {
  const db = getLocalDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(session.userId) as any;
  if (!user || !bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) {
    throw new AuthError('Mot de passe actuel incorrect.', 'INVALID_CREDENTIALS');
  }
  validatePasswordStrength(newPassword);

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), session.userId);
  session.mustChangePassword = false;

  recordAudit({
    actor: sessionActor(session),
    action: 'auth.password.changed',
    module: 'users',
    summary: `${session.fullName} a changé son mot de passe.`,
    entityType: 'user',
    entityId: session.userId,
    storeId: session.storeId
  });
}

export function validatePasswordStrength(password: string): void {
  const pwd = String(password || '');
  if (pwd.length < 6) {
    throw new AuthError('Le mot de passe doit contenir au moins 6 caractères.', 'WEAK_PASSWORD');
  }
}

/** Matrice de permissions par défaut d'un rôle, pour pré-remplir l'écran de création. */
export function defaultPermissionsFor(role: UserRole) {
  return permissionMatrixToRows(DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.cashier);
}

export function toPublicSession(session: Session) {
  return {
    userId: session.userId,
    id: session.userId,
    username: session.username,
    fullName: session.fullName,
    role: session.role,
    storeId: session.storeId,
    isActive: true,
    permissions: session.permissions,
    mustChangePassword: session.mustChangePassword,
    startedAt: new Date(session.startedAt).toISOString()
  };
}
