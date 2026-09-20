import { SYSTEM_MODULES, type SystemModule } from '../constants';

/**
 * Rôles système. `owner` est le super-administrateur : il possède implicitement
 * toutes les permissions et ne peut pas être privé d'accès.
 */
export const USER_ROLES = ['owner', 'manager', 'cashier', 'auditor'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propriétaire (accès total)',
  manager: 'Gérant de boutique',
  cashier: 'Caissier / Vendeur',
  auditor: 'Auditeur (lecture seule)'
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Contrôle total : utilisateurs, paramètres, journal d\'audit, toutes les boutiques.',
  manager: 'Pilote une boutique : ventes, achats, stock, dépenses, rapports. Pas de gestion des comptes.',
  cashier: 'Encaisse et gère les clients. Ne voit ni les coûts d\'achat ni les rapports financiers.',
  auditor: 'Consultation seule de toutes les données et du journal, sans aucune modification.'
};

export interface PermissionFlags {
  canView: boolean;
  canEdit: boolean;
}

export type PermissionMatrix = Record<SystemModule, PermissionFlags>;

const NONE: PermissionFlags = { canView: false, canEdit: false };
const VIEW: PermissionFlags = { canView: true, canEdit: false };
const FULL: PermissionFlags = { canView: true, canEdit: true };

function matrix(overrides: Partial<Record<SystemModule, PermissionFlags>>, fallback: PermissionFlags): PermissionMatrix {
  const out = {} as PermissionMatrix;
  for (const m of SYSTEM_MODULES) {
    out[m] = overrides[m] ?? { ...fallback };
  }
  return out;
}

/** Permissions appliquées par défaut à la création d'un compte, selon son rôle. */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionMatrix> = {
  owner: matrix({}, FULL),
  manager: matrix(
    {
      users: VIEW,
      settings: VIEW,
      journal: VIEW
    },
    FULL
  ),
  cashier: matrix(
    {
      pos: FULL,
      clients: FULL,
      produits: VIEW,
      stock: VIEW,
      depenses: FULL,
      fournisseurs: NONE,
      achat: NONE,
      rapport: NONE,
      zakat: NONE,
      settings: NONE,
      users: NONE,
      journal: NONE
    },
    NONE
  ),
  auditor: matrix({ users: NONE }, VIEW)
};

/** Modules que seul le propriétaire peut modifier, quelles que soient les permissions accordées. */
export const OWNER_ONLY_EDIT_MODULES: SystemModule[] = ['users'];

export interface PermissionLike {
  module: SystemModule | string;
  canView: boolean;
  canEdit: boolean;
}

export interface PrincipalLike {
  role?: string | null;
  permissions?: PermissionLike[] | null;
}

/**
 * Source de vérité unique pour « cet utilisateur peut-il faire ceci ? ».
 * Utilisée à l'identique dans le process principal Electron, l'API serveur et l'UI,
 * pour qu'aucune couche ne puisse diverger.
 */
export function can(principal: PrincipalLike | null | undefined, moduleName: SystemModule, action: 'view' | 'edit'): boolean {
  if (!principal) return false;
  if (principal.role === 'owner') return true;

  if (action === 'edit' && OWNER_ONLY_EDIT_MODULES.includes(moduleName)) return false;

  const perm = principal.permissions?.find(p => p.module === moduleName);
  if (!perm) return false;
  return action === 'view' ? Boolean(perm.canView) : Boolean(perm.canEdit);
}

/** Convertit la matrice d'un rôle en liste plate, prête pour l'insertion en base. */
export function permissionMatrixToRows(m: PermissionMatrix): Array<{ module: SystemModule; canView: boolean; canEdit: boolean }> {
  return SYSTEM_MODULES.map(module => ({
    module,
    canView: m[module]?.canView ?? false,
    canEdit: m[module]?.canEdit ?? false
  }));
}
