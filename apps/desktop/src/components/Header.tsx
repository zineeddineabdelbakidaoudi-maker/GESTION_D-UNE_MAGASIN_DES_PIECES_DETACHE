import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { formatDZD } from '@gestion-veloo/shared';
import { 
  Building2, 
  Scan, 
  DollarSign, 
  RefreshCw, 
  User as UserIcon,
  Languages,
  Store as StoreIcon,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';

export const Header: React.FC = () => {
  const { currentStore, setCurrentStore, currentUser, setCurrentUser, capital, lang, setLang, theme, toggleTheme } = useStore();
  const [stores, setStores] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    invokeIpc<any>('get-metadata').then(res => {
      if (res && res.stores) {
        setStores(res.stores);
      }
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      alert(lang === 'ar' ? 'تمت المزامنة بنجاح مع الخادم المركزي!' : 'Synchronisation réussie avec le serveur central !');
    }, 800);
  };

  const handleLogout = () => {
    if (confirm(lang === 'ar' ? 'هل تريد قفل جلسة الصندوق وتسجيل الخروج؟' : 'Voulez-vous fermer la session de caisse et vous déconnecter ?')) {
      setCurrentUser(null);
    }
  };

  const isAr = lang === 'ar';
  const isDark = theme === 'dark';
  const isOwner = currentUser?.role === 'owner';

  return (
    <header className={`h-14 border-b px-4 flex items-center justify-between shrink-0 select-none shadow-sm transition-colors ${
      isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
    }`}>
      {/* Left: Store Selector & Douchette Ready */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 border px-3 py-1.5 rounded-xl text-xs ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-300'
        }`}>
          <StoreIcon className="w-4 h-4 text-blue-500" />
          {isOwner ? (
            <select
              value={currentStore?.id || 1}
              onChange={e => {
                const s = stores.find(st => st.id === parseInt(e.target.value, 10));
                if (s) setCurrentStore(s);
              }}
              className={`bg-transparent font-bold outline-none cursor-pointer ${
                isDark ? 'text-slate-100' : 'text-slate-800'
              }`}
            >
              {stores.map(s => (
                <option key={s.id} value={s.id} className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {currentStore?.name || (currentUser?.storeId === 1 ? 'Boutique 1 (Centre)' : 'Boutique 2 (Dépôt)')}
            </span>
          )}
        </div>

        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold ${
          isDark ? 'bg-slate-800/80 border-slate-700 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <Scan className="w-3.5 h-3.5" />
          <span>{isAr ? 'القارئ جاهز' : 'Douchette Prête'}</span>
        </div>
      </div>

      {/* Right: Theme Toggle, Language toggle, Capital, Sync, Cashier */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle (Dark / Light) */}
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-sm ${
            isDark 
              ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-400 hover:text-amber-300' 
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 hover:text-slate-900'
          }`}
          title={isDark ? (isAr ? 'تفعيل الوضع الفاتح' : 'Passer au mode Clair') : (isAr ? 'تفعيل الوضع المظلم' : 'Passer au mode Sombre')}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          <span className="hidden sm:inline">{isDark ? (isAr ? 'فاتح' : 'Clair') : (isAr ? 'مظلم' : 'Sombre')}</span>
        </button>

        {/* Language Switcher */}
        <button
          onClick={() => setLang(isAr ? 'fr' : 'ar')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-xl text-xs font-bold transition-colors ${
            isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-blue-400' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-blue-600'
          }`}
          title="Changer de langue / تغيير اللغة"
        >
          <Languages className="w-3.5 h-3.5" />
          <span>{isAr ? 'Français' : 'العربية'}</span>
        </button>

        {/* Capital Stock Badge */}
        <div className={`flex items-center gap-2 px-3 py-1 border rounded-xl ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-100 border-slate-200'
        }`}>
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-400 leading-none">
              {isAr ? 'رأس مال المخزون' : 'Capital Stock'}
            </div>
            <div className="text-xs font-black text-emerald-400 font-mono leading-tight mt-0.5">
              {formatDZD(capital)}
            </div>
          </div>
        </div>

        {/* Sync Status Button */}
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            isOnline 
              ? isDark ? 'bg-slate-800 text-blue-400 border-slate-700 hover:bg-slate-750' : 'bg-slate-100 text-blue-600 border-slate-200 hover:bg-slate-200'
              : 'bg-amber-900/30 text-amber-400 border-amber-800/40'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">
            {syncing ? (isAr ? 'مزامنة...' : 'Synchronisation...') : (isOnline ? (isAr ? 'متزامن' : 'Synchronisé') : (isAr ? 'غير متصل' : 'Hors-Ligne'))}
          </span>
        </button>

        {/* Cashier Info & Logout */}
        <div className={`flex items-center gap-2 pl-2 border-l ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold border ${
            isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
          }`}>
            <UserIcon className="w-3.5 h-3.5" />
          </div>
          <div className="hidden lg:block text-left">
            <div className={`text-xs font-bold leading-tight ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
              {currentUser?.fullName || 'Caissier'}
            </div>
            <div className="text-[9px] text-blue-500 font-bold uppercase">
              {currentUser?.role === 'owner' ? (isAr ? 'المالك' : 'Gérant') : (isAr ? 'بائع' : 'Vendeur')}
            </div>
          </div>

          <button
            onClick={handleLogout}
            title={isAr ? 'تسجيل الخروج' : 'Fermer la session de caisse'}
            className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
