import type { SystemModule } from '../constants';

/**
 * Journal d'audit : vocabulaire partagé entre le poste de caisse (Electron),
 * l'API centrale et le portail web du propriétaire.
 *
 * Le journal est en ajout seul (append-only) : aucune ligne n'est jamais
 * modifiée ni supprimée par l'application.
 */

export const AUDIT_SEVERITIES = ['info', 'notice', 'warning', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: 'Information',
  notice: 'À signaler',
  warning: 'Avertissement',
  critical: 'Critique'
};

export const AUDIT_ACTIONS = [
  'auth.login.success',
  'auth.login.failed',
  'auth.logout',
  'auth.locked',
  'auth.password.changed',
  'access.denied',
  'user.created',
  'user.updated',
  'user.deactivated',
  'user.permissions.changed',
  'product.created',
  'product.updated',
  'product.price.changed',
  'product.cost.recalculated',
  'product.photo.updated',
  'sale.created',
  'sale.voided',
  'return.created',
  'purchase.created',
  'stock.adjusted',
  'stock.transferred',
  'client.created',
  'client.updated',
  'client.payment',
  'supplier.created',
  'supplier.updated',
  'supplier.payment',
  'expense.created',
  'expense.deleted',
  'settings.updated',
  'metadata.created',
  'metadata.deleted',
  'sync.pushed',
  'sync.failed'
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'auth.login.success': 'Connexion réussie',
  'auth.login.failed': 'Échec de connexion',
  'auth.logout': 'Déconnexion',
  'auth.locked': 'Compte verrouillé (tentatives échouées)',
  'auth.password.changed': 'Mot de passe modifié',
  'access.denied': 'Accès refusé',
  'user.created': 'Utilisateur créé',
  'user.updated': 'Utilisateur modifié',
  'user.deactivated': 'Utilisateur désactivé',
  'user.permissions.changed': 'Permissions modifiées',
  'product.created': 'Article créé',
  'product.updated': 'Article modifié',
  'product.price.changed': 'Prix de vente modifié',
  'product.cost.recalculated': 'Prix d\'achat recalculé',
  'product.photo.updated': 'Photo d\'article mise à jour',
  'sale.created': 'Vente encaissée',
  'sale.voided': 'Vente annulée',
  'return.created': 'Retour client',
  'purchase.created': 'Bon d\'achat enregistré',
  'stock.adjusted': 'Ajustement de stock',
  'stock.transferred': 'Transfert inter-boutique',
  'client.created': 'Client créé',
  'client.updated': 'Client modifié',
  'client.payment': 'Versement client',
  'supplier.created': 'Fournisseur créé',
  'supplier.updated': 'Fournisseur modifié',
  'supplier.payment': 'Règlement fournisseur',
  'expense.created': 'Dépense enregistrée',
  'expense.deleted': 'Dépense supprimée',
  'settings.updated': 'Paramètres modifiés',
  'metadata.created': 'Référentiel : élément ajouté',
  'metadata.deleted': 'Référentiel : élément supprimé',
  'sync.pushed': 'Synchronisation envoyée',
  'sync.failed': 'Échec de synchronisation'
};

/** Sévérité par défaut d'une action, pour colorer le journal sans calcul côté UI. */
export const AUDIT_ACTION_SEVERITY: Partial<Record<AuditAction, AuditSeverity>> = {
  'auth.login.failed': 'warning',
  'auth.locked': 'critical',
  'access.denied': 'critical',
  'user.created': 'notice',
  'user.deactivated': 'critical',
  'user.permissions.changed': 'critical',
  'auth.password.changed': 'critical',
  'product.price.changed': 'notice',
  'product.cost.recalculated': 'notice',
  'sale.voided': 'critical',
  'return.created': 'notice',
  'stock.adjusted': 'warning',
  'stock.transferred': 'notice',
  'expense.deleted': 'warning',
  'settings.updated': 'critical',
  'metadata.deleted': 'warning',
  'sync.failed': 'warning'
};

export function severityOf(action: string): AuditSeverity {
  return AUDIT_ACTION_SEVERITY[action as AuditAction] ?? 'info';
}

export interface AuditFieldChange {
  field: string;
  label?: string;
  before: unknown;
  after: unknown;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  userName?: string | null;
  storeId: number | null;
  storeName?: string | null;
  action: AuditAction | string;
  module: SystemModule | string;
  entityType?: string | null;
  entityId?: number | null;
  severity: AuditSeverity;
  summary: string;
  changes?: AuditFieldChange[] | null;
  metadata?: Record<string, unknown> | null;
  deviceId?: string | null;
  appVersion?: string | null;
  createdAt: string;
}

/**
 * Compare deux objets plats et produit la liste des champs réellement modifiés.
 * Sert à ne journaliser que le delta, avec avant/après, plutôt qu'un dump complet.
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  labels: Record<string, string> = {}
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of keys) {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (JSON.stringify(b ?? null) === JSON.stringify(a ?? null)) continue;
    changes.push({ field: key, label: labels[key] || key, before: b ?? null, after: a ?? null });
  }

  return changes;
}
