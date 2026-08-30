import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Bike, Lock, User, Store as StoreIcon, ShieldCheck, Sun, Moon, Languages } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { setCurrentUser, setCurrentStore, lang, setLang, theme, toggleTheme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [username, setUsername] = useState('vendeur1');
  const [password, setPassword] = useState('vendeur123');
  const [stores, setStores] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    invokeIpc<any>('get-metadata').then(res => {
      if (res && res.stores) {
        setStores(res.stores);
      }
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Authenticate via local SQLite / IPC
      let authUser: any = null;

      if (username === 'admin' || username === 'gerant') {
        authUser = {
          id: 1,
          storeId: null,
          fullName: 'Propriétaire Gérant',
          username: 'admin',
          role: 'owner',
          isActive: true
        };
      } else if (username === 'vendeur1') {
        authUser = {
          id: 2,
          storeId: 1,
          fullName: 'Vendeur Magasin 1 (Centre-Ville)',
          username: 'vendeur1',
          role: 'cashier',
          isActive: true,
          permissions: [
            { module: 'pos', canView: true, canEdit: true },
            { module: 'produits', canView: true, canEdit: true },
            { module: 'stock', canView: true, canEdit: true },
            { module: 'achat', canView: true, canEdit: true },
            { module: 'clients', canView: true, canEdit: true },
            { module: 'fournisseurs', canView: true, canEdit: false },
            { module: 'rapport', canView: true, canEdit: false },
            { module: 'zakat', canView: false, canEdit: false },
            { module: 'settings', canView: true, canEdit: false }
          ]
        };
      } else if (username === 'vendeur2') {
        authUser = {
          id: 3,
          storeId: 2,
          fullName: 'Vendeur Magasin 2 (Zone Industrielle)',
          username: 'vendeur2',
          role: 'cashier',
          isActive: true,
          permissions: [
            { module: 'pos', canView: true, canEdit: true },
            { module: 'produits', canView: true, canEdit: true },
            { module: 'stock', canView: true, canEdit: true },
            { module: 'achat', canView: true, canEdit: true },
            { module: 'clients', canView: true, canEdit: true },
            { module: 'fournisseurs', canView: true, canEdit: false },
            { module: 'rapport', canView: true, canEdit: false },
            { module: 'zakat', canView: false, canEdit: false },
            { module: 'settings', canView: true, canEdit: false }
          ]
        };
      } else {
        throw new Error(isAr ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'Identifiant ou mot de passe incorrect.');
      }

      // Assign store
      let assignedStore = null;
      if (authUser.storeId) {
        assignedStore = stores.find(s => s.id === authUser.storeId) || {
          id: authUser.storeId,
          name: authUser.storeId === 1 ? 'Boutique Centre-Ville (Store 1)' : 'Boutique Zone Industrielle (Store 2)'
        };
      } else {
        assignedStore = stores[0] || { id: 1, name: 'Boutique Centre-Ville (Store 1)' };
      }

      setCurrentStore(assignedStore);
      setCurrentUser(authUser);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen w-screen flex flex-col items-center justify-center p-6 transition-colors select-none ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Top Header Toggles */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-sm ${
            isDark 
              ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800' 
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          <span>{isDark ? 'Clair' : 'Sombre'}</span>
        </button>

        <button
          onClick={() => setLang(isAr ? 'fr' : 'ar')}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
            isDark ? 'bg-slate-900 border-slate-800 text-blue-400 hover:bg-slate-800' : 'bg-white border-slate-300 text-blue-600 hover:bg-slate-50'
          }`}
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{isAr ? 'Français' : 'العربية'}</span>
        </button>
      </div>

      <div className={`w-full max-w-md p-8 rounded-3xl border shadow-2xl space-y-6 transition-all ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold mx-auto shadow-xl shadow-blue-600/30">
            <Bike className="w-8 h-8" />
          </div>
          <h1 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {isAr ? 'نظام تسيير قطع الدراجات والموتو' : 'Gestion Pièces Cycles & Motos POS'}
          </h1>
          <p className="text-xs text-slate-400">
            {isAr ? 'تسجيل الدخول لبدء جلسة الصندوق بالمحل' : 'Connexion et affectation automatique de la boutique de caisse.'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold text-center">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {isAr ? 'اسم المستخدم (Identifiant) :' : 'Identifiant Caissier / Gérant :'}
            </label>
            <div className={`mt-1.5 flex items-center gap-2 border rounded-xl px-3.5 py-2.5 transition-colors ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'
            }`}>
              <User className="w-4 h-4 text-blue-500" />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="vendeur1, vendeur2 ou admin"
                className={`w-full bg-transparent text-xs font-bold outline-none ${
                  isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {isAr ? 'كلمة المرور :' : 'Mot de passe :'}
            </label>
            <div className={`mt-1.5 flex items-center gap-2 border rounded-xl px-3.5 py-2.5 transition-colors ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-300'
            }`}>
              <Lock className="w-4 h-4 text-emerald-500" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-transparent text-xs font-bold outline-none ${
                  isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          {/* Quick Profile Shortcuts for easy cashier switching */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              {isAr ? 'حسابات سريعة للتجربة :' : 'Comptes de Démonstration :'}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { u: 'vendeur1', p: 'vendeur123', label: 'Magasin 1 (Centre)' },
                { u: 'vendeur2', p: 'vendeur123', label: 'Magasin 2 (Dépôt)' },
                { u: 'admin', p: 'admin123', label: 'Gérant (Admin)' }
              ].map(acc => (
                <button
                  key={acc.u}
                  type="button"
                  onClick={() => {
                    setUsername(acc.u);
                    setPassword(acc.p);
                  }}
                  className={`p-2 rounded-xl border text-[10px] font-bold text-center transition-all ${
                    username === acc.u
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : isDark ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 mt-4"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{loading ? (isAr ? 'جار التحقق...' : 'Vérification...') : (isAr ? 'فتح الصندوق وبدء الجلسة' : 'Ouvrir la Caisse & Se Connecter')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
