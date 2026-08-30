import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { apiRequest } from '../api/client';
import { Store } from '@gestion-veloo/shared';
import { Building2, LogOut, UserCircle, Sun, Moon, Radio, Activity, RefreshCw } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, selectedStoreId, setSelectedStoreId, theme, toggleTheme } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const isDark = theme === 'dark';

  useEffect(() => {
    apiRequest<Store[]>('/stores')
      .then(setStores)
      .catch(console.error);
  }, []);

  return (
    <header className={`h-16 border-b px-6 flex items-center justify-between sticky top-0 z-30 transition-colors shadow-sm ${
      isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
    }`}>
      {/* Left: Store Scope & Network Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Boutique Active :</span>
        </div>
        <select
          value={selectedStoreId || ''}
          onChange={(e) => setSelectedStoreId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className={`border rounded-xl px-3 py-1.5 text-xs font-bold outline-none cursor-pointer ${
            isDark 
              ? 'bg-slate-800 border-slate-700 text-white' 
              : 'bg-slate-100 border-slate-300 text-slate-800'
          }`}
        >
          <option value="">Consolidé (Boutique 1 + Boutique 2)</option>
          {stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Live Network Sync Badge */}
        <div className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold border ${
          isDark ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Réseau Multi-Boutiques Actif (Store 1 & 2 En Ligne)</span>
        </div>
      </div>

      {/* Right: Theme, User, Logout */}
      <div className="flex items-center gap-3">
        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-sm ${
            isDark 
              ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-400 hover:text-amber-300' 
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
          }`}
          title={isDark ? 'Mode Clair' : 'Mode Sombre'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          <span className="hidden sm:inline">{isDark ? 'Clair' : 'Sombre'}</span>
        </button>

        {/* User Badge */}
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl border ${
          isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-800'
        }`}>
          <UserCircle className="w-4 h-4 text-blue-400" />
          <span className="font-bold">{user?.fullName || user?.username}</span>
          <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md font-bold uppercase">
            {user?.role === 'owner' ? 'Propriétaire' : user?.role}
          </span>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-colors font-bold"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
};
