import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Modal, PageHeader, EmptyState, LoadingState, AccessDenied, StatCard } from '../components/ui';
import {
  SYSTEM_MODULES, MODULE_LABELS, USER_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS,
  DEFAULT_ROLE_PERMISSIONS, permissionMatrixToRows, type SystemModule, type UserRole
} from '@gestion-veloo/shared';
import {
  UsersRound, UserPlus, ShieldCheck, KeyRound, Lock, Unlock, Eye, Pencil, Ban, Check
} from 'lucide-react';

interface PermRow { module: SystemModule; canView: boolean; canEdit: boolean }

interface ManagedUser {
  id: number;
  storeId: number | null;
  storeName?: string | null;
  fullName: string;
  username: string;
  role: UserRole;
  phone: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  failedAttempts: number;
  isLocked: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  permissions: PermRow[];
  stats?: { salesCount: number; auditCount: number };
}

const emptyDraft = {
  id: 0,
  fullName: '',
  username: '',
  password: '',
  phone: '',
  role: 'cashier' as UserRole,
  storeId: null as number | null,
  isActive: true,
  mustChangePassword: true
};

export const UsersPage: React.FC = () => {
  const { hasPermission, currentUser, stores, pushToast, notifyError } = useStore();
  const canView = hasPermission('users', 'view');
  const isOwner = currentUser?.role === 'owner';

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [permissions, setPermissions] = useState<PermRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await invokeIpc<ManagedUser[]>('get-users'));
    } catch (err) {
      notifyError(err, 'Chargement des comptes impossible');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    locked: users.filter(u => u.isLocked).length,
    owners: users.filter(u => u.role === 'owner' && u.isActive).length
  }), [users]);

  const openCreate = () => {
    setDraft({ ...emptyDraft });
    setPermissions(permissionMatrixToRows(DEFAULT_ROLE_PERMISSIONS.cashier) as PermRow[]);
    setEditorOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setDraft({
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      password: '',
      phone: user.phone || '',
      role: user.role,
      storeId: user.storeId,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword
    });
    setPermissions(
      SYSTEM_MODULES.map(m => {
        const found = user.permissions.find(p => p.module === m);
        return { module: m, canView: Boolean(found?.canView), canEdit: Boolean(found?.canEdit) };
      })
    );
    setEditorOpen(true);
  };

  /** Changer de rôle recharge la matrice par défaut correspondante. */
  const applyRoleTemplate = (role: UserRole) => {
    setDraft(d => ({ ...d, role }));
    setPermissions(permissionMatrixToRows(DEFAULT_ROLE_PERMISSIONS[role]) as PermRow[]);
  };

  const togglePermission = (module: SystemModule, field: 'canView' | 'canEdit') => {
    setPermissions(rows =>
      rows.map(r => {
        if (r.module !== module) return r;
        const next = { ...r, [field]: !r[field] };
        // Un droit de modification implique le droit de consultation.
        if (field === 'canEdit' && next.canEdit) next.canView = true;
        if (field === 'canView' && !next.canView) next.canEdit = false;
        return next;
      })
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      if (draft.id) {
        await invokeIpc('update-user', {
          id: draft.id,
          fullName: draft.fullName,
          role: draft.role,
          storeId: draft.storeId,
          phone: draft.phone,
          isActive: draft.isActive,
          mustChangePassword: draft.mustChangePassword,
          permissions
        });
        pushToast({ kind: 'success', title: 'Compte mis à jour', description: `@${draft.username}` });
      } else {
        await invokeIpc('create-user', {
          fullName: draft.fullName,
          username: draft.username,
          password: draft.password,
          role: draft.role,
          storeId: draft.storeId,
          phone: draft.phone,
          mustChangePassword: draft.mustChangePassword,
          permissions
        });
        pushToast({ kind: 'success', title: 'Compte créé', description: `@${draft.username} — ${ROLE_LABELS[draft.role]}` });
      }
      setEditorOpen(false);
      load();
    } catch (err) {
      notifyError(err, 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: ManagedUser) => {
    try {
      await invokeIpc('update-user', { id: user.id, isActive: !user.isActive, role: user.role });
      pushToast({
        kind: user.isActive ? 'warning' : 'success',
        title: user.isActive ? 'Compte désactivé' : 'Compte réactivé',
        description: `@${user.username}`
      });
      load();
    } catch (err) {
      notifyError(err, 'Modification impossible');
    }
  };

  const unlock = async (user: ManagedUser) => {
    try {
      await invokeIpc('update-user', { id: user.id, role: user.role, unlock: true });
      pushToast({ kind: 'success', title: 'Compte déverrouillé', description: `@${user.username}` });
      load();
    } catch (err) {
      notifyError(err, 'Déverrouillage impossible');
    }
  };

  const resetPassword = async () => {
    if (!passwordTarget) return;
    try {
      await invokeIpc('reset-user-password', { id: passwordTarget.id, newPassword });
      pushToast({
        kind: 'success',
        title: 'Mot de passe réinitialisé',
        description: `@${passwordTarget.username} devra le changer à sa prochaine connexion.`
      });
      setPasswordTarget(null);
      setNewPassword('');
      load();
    } catch (err) {
      notifyError(err, 'Réinitialisation impossible');
    }
  };

  if (!canView) return <AccessDenied module={MODULE_LABELS.users} />;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Utilisateurs & Rôles"
        subtitle="Chaque compte, chaque droit, module par module."
        icon={UsersRound}
        actions={
          isOwner && (
            <button className="gv-btn-primary" onClick={openCreate}>
              <UserPlus className="w-4 h-4" /> Nouveau compte
            </button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto gv-scroll p-5 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Comptes" value={stats.total} icon={UsersRound} tone="accent" />
          <StatCard label="Actifs" value={stats.active} icon={Check} tone="success" />
          <StatCard label="Verrouillés" value={stats.locked} icon={Lock} tone={stats.locked ? 'danger' : 'neutral'} />
          <StatCard label="Propriétaires" value={stats.owners} icon={ShieldCheck} tone="warning" />
        </div>

        {!isOwner && (
          <div className="gv-card-flat !py-3 text-[11px] gv-muted flex items-center gap-2">
            <Eye className="w-4 h-4 shrink-0" />
            Consultation seule : seul le propriétaire peut créer ou modifier des comptes.
          </div>
        )}

        {loading ? (
          <LoadingState label="Chargement des comptes…" />
        ) : users.length === 0 ? (
          <EmptyState title="Aucun compte" description="Créez le premier compte utilisateur." icon={UsersRound} />
        ) : (
          <div className="gv-card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="gv-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Boutique</th>
                    <th>Modules autorisés</th>
                    <th>Dernière connexion</th>
                    <th>État</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const viewable = user.role === 'owner' ? SYSTEM_MODULES.length : user.permissions.filter(p => p.canView).length;
                    const editable = user.role === 'owner' ? SYSTEM_MODULES.length : user.permissions.filter(p => p.canEdit).length;
                    return (
                      <tr key={user.id} className={user.isActive ? '' : 'opacity-55'}>
                        <td>
                          <div className="font-bold">{user.fullName}</div>
                          <div className="text-[10px] gv-muted font-mono">@{user.username}</div>
                        </td>
                        <td>
                          <span className={user.role === 'owner' ? 'gv-badge-warning' : user.role === 'auditor' ? 'gv-badge-neutral' : 'gv-badge-accent'}>
                            {ROLE_LABELS[user.role]?.split(' (')[0] || user.role}
                          </span>
                        </td>
                        <td className="text-[11px] gv-muted">
                          {user.storeName || (user.role === 'owner' ? 'Toutes' : '—')}
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="gv-badge-neutral"><Eye className="w-3 h-3" />{viewable}</span>
                            <span className="gv-badge-neutral"><Pencil className="w-3 h-3" />{editable}</span>
                          </div>
                        </td>
                        <td className="text-[11px] gv-muted font-mono">
                          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('fr-DZ') : 'Jamais'}
                        </td>
                        <td>
                          {user.isLocked ? (
                            <span className="gv-badge-danger gv-alert-pulse"><Lock className="w-3 h-3" />Verrouillé</span>
                          ) : user.isActive ? (
                            <span className="gv-badge-success">Actif</span>
                          ) : (
                            <span className="gv-badge-neutral">Désactivé</span>
                          )}
                          {user.mustChangePassword && (
                            <span className="gv-badge-warning ms-1"><KeyRound className="w-3 h-3" />MDP à changer</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            {isOwner && user.isLocked && (
                              <button className="gv-btn-ghost !px-2 !py-1.5" title="Déverrouiller" onClick={() => unlock(user)}>
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isOwner && (
                              <>
                                <button className="gv-btn-ghost !px-2 !py-1.5" title="Réinitialiser le mot de passe" onClick={() => { setPasswordTarget(user); setNewPassword(''); }}>
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button className="gv-btn-ghost !px-2 !py-1.5" title="Modifier / permissions" onClick={() => openEdit(user)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {user.id !== currentUser?.id && (
                                  <button
                                    className="gv-btn-ghost !px-2 !py-1.5"
                                    title={user.isActive ? 'Désactiver' : 'Réactiver'}
                                    onClick={() => toggleActive(user)}
                                  >
                                    {user.isActive ? <Ban className="w-3.5 h-3.5 text-rose-500" /> : <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Éditeur de compte + matrice de permissions */}
      <Modal
        open={editorOpen}
        title={draft.id ? `Modifier @${draft.username}` : 'Nouveau compte utilisateur'}
        subtitle="Le rôle pré-remplit les permissions ; chaque module reste ajustable individuellement."
        icon={ShieldCheck}
        width="max-w-4xl"
        onClose={() => setEditorOpen(false)}
        footer={
          <>
            <button className="gv-btn-ghost" onClick={() => setEditorOpen(false)}>Annuler</button>
            <button
              className="gv-btn-primary"
              disabled={saving || !draft.fullName.trim() || (!draft.id && (!draft.username.trim() || draft.password.length < 6))}
              onClick={save}
            >
              {saving ? 'Enregistrement…' : draft.id ? 'Enregistrer' : 'Créer le compte'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="gv-label">Nom complet</label>
              <input className="gv-input" value={draft.fullName} onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))} placeholder="Ex. Karim Benali" />
            </div>
            <div>
              <label className="gv-label">Identifiant de connexion</label>
              <input
                className="gv-input font-mono"
                value={draft.username}
                disabled={Boolean(draft.id)}
                onChange={e => setDraft(d => ({ ...d, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                placeholder="karim.b"
              />
              {!draft.id && <p className="text-[10px] gv-muted mt-1">3 à 32 caractères : lettres, chiffres, point, tiret, souligné.</p>}
            </div>
            {!draft.id && (
              <div>
                <label className="gv-label">Mot de passe initial</label>
                <input
                  className="gv-input"
                  type="password"
                  value={draft.password}
                  onChange={e => setDraft(d => ({ ...d, password: e.target.value }))}
                  placeholder="6 caractères minimum"
                />
              </div>
            )}
            <div>
              <label className="gv-label">Téléphone</label>
              <input className="gv-input" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="0550 00 00 00" />
            </div>
            <div>
              <label className="gv-label">Boutique affectée</label>
              <select
                className="gv-input"
                value={draft.storeId ?? ''}
                onChange={e => setDraft(d => ({ ...d, storeId: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Toutes les boutiques (direction)</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={draft.isActive} onChange={e => setDraft(d => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                Compte actif
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={draft.mustChangePassword} onChange={e => setDraft(d => ({ ...d, mustChangePassword: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                Changement de mot de passe imposé
              </label>
            </div>
          </div>

          <div>
            <label className="gv-label">Rôle</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {USER_ROLES.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => applyRoleTemplate(role)}
                  className={`text-start p-3 rounded-xl border transition-all ${
                    draft.role === role ? 'border-blue-500 bg-blue-500/10' : ''
                  }`}
                  style={draft.role === role ? undefined : { borderColor: 'rgb(var(--gv-border-strong))', backgroundColor: 'rgb(var(--gv-surface-2))' }}
                >
                  <div className="text-[11px] font-black">{ROLE_LABELS[role].split(' (')[0]}</div>
                  <div className="text-[10px] gv-muted mt-1 leading-snug">{ROLE_DESCRIPTIONS[role]}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="gv-label !mb-0">Permissions par module</label>
              {draft.role === 'owner' && (
                <span className="gv-badge-warning">Le propriétaire conserve tous les droits</span>
              )}
            </div>
            <div className="gv-card-flat !p-0 overflow-hidden">
              <table className="gv-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th className="w-28 text-center">Consulter</th>
                    <th className="w-28 text-center">Modifier</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map(row => (
                    <tr key={row.module}>
                      <td className="font-semibold">{MODULE_LABELS[row.module]}</td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                          disabled={draft.role === 'owner'}
                          checked={draft.role === 'owner' || row.canView}
                          onChange={() => togglePermission(row.module, 'canView')}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          disabled={draft.role === 'owner' || row.module === 'users'}
                          checked={draft.role === 'owner' || row.canEdit}
                          onChange={() => togglePermission(row.module, 'canEdit')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] gv-muted mt-2">
              La gestion des comptes reste réservée au propriétaire : la colonne « Modifier » du module Utilisateurs est verrouillée.
            </p>
          </div>
        </div>
      </Modal>

      {/* Réinitialisation de mot de passe */}
      <Modal
        open={Boolean(passwordTarget)}
        title={`Réinitialiser le mot de passe de @${passwordTarget?.username || ''}`}
        subtitle="L'utilisateur devra définir un nouveau mot de passe à sa prochaine connexion."
        icon={KeyRound}
        width="max-w-md"
        onClose={() => setPasswordTarget(null)}
        footer={
          <>
            <button className="gv-btn-ghost" onClick={() => setPasswordTarget(null)}>Annuler</button>
            <button className="gv-btn-danger" disabled={newPassword.length < 6} onClick={resetPassword}>Réinitialiser</button>
          </>
        }
      >
        <label className="gv-label">Nouveau mot de passe provisoire</label>
        <input className="gv-input" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 caractères minimum" />
        <p className="text-[10px] gv-muted mt-2">Cette action est inscrite au journal d'audit avec votre nom.</p>
      </Modal>
    </div>
  );
};
