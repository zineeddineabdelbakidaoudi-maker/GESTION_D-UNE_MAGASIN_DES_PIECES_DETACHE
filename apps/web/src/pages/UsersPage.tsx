import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { SYSTEM_MODULES, MODULE_LABELS, SystemModule } from '@gestion-veloo/shared';
import { UserPlus, Shield, Check, X, Building, Key, UserCheck, UserX, Users as UsersIcon } from 'lucide-react';

interface UserItem {
  id: number;
  storeId: number | null;
  storeName?: string;
  fullName: string;
  username: string;
  isActive: boolean;
  role: string;
  createdAt: string;
  permissions: Array<{ module: SystemModule; canView: boolean; canEdit: boolean }>;
}

export const UsersPage: React.FC = () => {
  const { theme } = useAuthStore();
  const isDark = theme === 'dark';

  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Record<string, { canView: boolean; canEdit: boolean }>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New User Form State
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStoreId, setNewStoreId] = useState<number | ''>('');
  const [newRole, setNewRole] = useState<'cashier' | 'manager'>('cashier');
  const [createError, setCreateError] = useState('');

  const loadUsers = async () => {
    try {
      const res = await apiRequest<UserItem[]>('/users');
      setUsers(res);
      if (selectedUser) {
        const updated = res.find(u => u.id === selectedUser.id);
        if (updated) openPermissionEditor(updated);
      }
    } catch (err) {
      console.error('Users load error:', err);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openPermissionEditor = (u: UserItem) => {
    setSelectedUser(u);
    const matrix: Record<string, { canView: boolean; canEdit: boolean }> = {};
    for (const mod of SYSTEM_MODULES) {
      const p = u.permissions?.find(x => x.module === mod);
      matrix[mod] = {
        canView: p ? p.canView : false,
        canEdit: p ? p.canEdit : false
      };
    }
    setEditingPermissions(matrix);
  };

  const handlePermissionChange = (mod: string, type: 'canView' | 'canEdit', value: boolean) => {
    setEditingPermissions(prev => ({
      ...prev,
      [mod]: {
        ...prev[mod],
        [type]: value,
        ...(type === 'canEdit' && value ? { canView: true } : {}),
        ...(type === 'canView' && !value ? { canEdit: false } : {})
      }
    }));
  };

  const savePermissions = async () => {
    if (!selectedUser) return;
    try {
      const permissionsArray = Object.entries(editingPermissions).map(([module, perms]) => ({
        module,
        canView: perms.canView,
        canEdit: perms.canEdit
      }));

      await apiRequest(`/users/${selectedUser.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: permissionsArray })
      });

      alert('Permissions enregistrées avec succès !');
      loadUsers();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const toggleUserActive = async (u: UserItem) => {
    try {
      await apiRequest(`/users/${u.id}/toggle-active`, { method: 'PUT' });
      loadUsers();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName,
          username: newUsername,
          password: newPassword,
          storeId: newStoreId || null,
          role: newRole
        })
      });

      setShowCreateModal(false);
      setNewFullName('');
      setNewUsername('');
      setNewPassword('');
      setNewStoreId('');
      loadUsers();
      alert('Utilisateur créé avec succès !');
    } catch (err: any) {
      setCreateError(err.message || 'Erreur lors de la création');
    }
  };

  return (
    <div className={`p-8 space-y-6 min-h-full transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2.5 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <UsersIcon className="w-6 h-6 text-blue-500" />
            <span>Gestion des Utilisateurs & Droits d'Accès</span>
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Configuration des caissiers, responsables et matrice granulaire des 10 modules système.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nouvel Utilisateur</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Col: User List */}
        <div className={`rounded-3xl border shadow-sm overflow-hidden ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className={`p-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>Comptes Enregistrés ({users.length})</h3>
          </div>

          <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {users.map(u => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => openPermissionEditor(u)}
                  className={`p-4 cursor-pointer transition-all flex items-center justify-between ${
                    isSelected 
                      ? (isDark ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : 'bg-blue-50 border-l-4 border-l-blue-600')
                      : (isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50')
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.fullName}</span>
                      {u.role === 'owner' ? (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md font-bold uppercase">
                          Gérant
                        </span>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                          isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {u.role}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 font-mono">@{u.username}</p>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                      <Building className="w-3 h-3 text-slate-500" />
                      <span>{u.storeName || 'Toutes les boutiques'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUserActive(u);
                      }}
                      title={u.isActive ? 'Désactiver le compte' : 'Activer le compte'}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        u.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                      }`}
                    >
                      {u.isActive ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Cols: 10-Module Permission Matrix */}
        <div className={`lg:col-span-2 rounded-3xl border shadow-sm p-6 space-y-6 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {selectedUser ? (
            <div className="space-y-6">
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div>
                  <h2 className={`text-base font-black flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    <Shield className="w-5 h-5 text-blue-500" />
                    <span>Permissions de {selectedUser.fullName}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Modifiez les droits de consultation et d'édition pour chacun des 10 modules métier.
                  </p>
                </div>

                {selectedUser.role !== 'owner' && (
                  <button
                    onClick={savePermissions}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/30 transition-all"
                  >
                    Enregistrer les Droits
                  </button>
                )}
              </div>

              {selectedUser.role === 'owner' ? (
                <div className={`p-4 rounded-2xl border text-xs font-medium ${
                  isDark ? 'bg-blue-950/30 border-blue-800/50 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  👑 Le compte Propriétaire / Gérant dispose d'un accès total et irrévocable à l'ensemble des modules et fonctions du système.
                </div>
              ) : (
                <div className={`border rounded-2xl overflow-hidden ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}>
                  <table className="w-full text-left text-xs">
                    <thead className={`uppercase font-bold border-b ${
                      isDark ? 'bg-slate-800/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      <tr>
                        <th className="px-4 py-3">Module Système</th>
                        <th className="px-4 py-3 text-center">Consulter (Voir)</th>
                        <th className="px-4 py-3 text-center">Modifier (Éditer)</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                      {SYSTEM_MODULES.map(mod => {
                        const perm = editingPermissions[mod] || { canView: false, canEdit: false };
                        return (
                          <tr key={mod} className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{MODULE_LABELS[mod]}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">mod: {mod}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perm.canView}
                                onChange={(e) => handlePermissionChange(mod, 'canView', e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={perm.canEdit}
                                onChange={(e) => handlePermissionChange(mod, 'canEdit', e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400 text-xs">
              Sélectionnez un utilisateur dans la liste de gauche pour configurer ses droits.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create User (High Contrast & Theme Aware) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl transition-all ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <h3 className={`text-base font-black flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <UserPlus className="w-5 h-5 text-blue-500" />
                <span>Nouveau Compte Utilisateur</span>
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className={`p-1 rounded-lg transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Nom Complet du Vendeur *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="Ex: Anes Vendeur"
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none transition-colors ${
                    isDark 
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                  }`}
                />
              </div>

              <div>
                <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Identifiant de connexion (Username) *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="Ex: anes"
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none transition-colors ${
                    isDark 
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                  }`}
                />
              </div>

              <div>
                <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Mot de passe *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none transition-colors ${
                    isDark 
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    Boutique Affectée
                  </label>
                  <select
                    value={newStoreId}
                    onChange={e => setNewStoreId(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className={`w-full mt-1.5 border rounded-xl px-3 py-2.5 text-xs font-bold outline-none cursor-pointer ${
                      isDark 
                        ? 'bg-slate-800 border-slate-700 text-white' 
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="">Toutes les Boutiques</option>
                    <option value="1">Boutique 1 (Centre)</option>
                    <option value="2">Boutique 2 (Dépôt)</option>
                  </select>
                </div>

                <div>
                  <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    Rôle Système
                  </label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className={`w-full mt-1.5 border rounded-xl px-3 py-2.5 text-xs font-bold outline-none cursor-pointer ${
                      isDark 
                        ? 'bg-slate-800 border-slate-700 text-white' 
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="cashier">Caissier / Vendeur</option>
                    <option value="manager">Responsable Magasin</option>
                  </select>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/30 transition-all"
                >
                  Créer l'Utilisateur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
