import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpcSafe } from '../api/electronBridge';
import { runFullSync } from '../api/syncEngine';
import { formatDZD, ROLE_LABELS } from '@gestion-veloo/shared';
import { ConfirmDialog } from './ui';
import {
  Scan, RefreshCw, User as UserIcon, Languages, Store as StoreIcon,
  Sun, Moon, LogOut, TrendingUp, Wifi, WifiOff, KeyRound
} from 'lucide-react';

interface HeaderProps {
  onChangePassword: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onChangePassword }) => {
  const {
    currentStore, setCurrentStore, stores, currentUser, signOut,
    lang, setLang, theme, toggleTheme, hasPermission, capabilities, pushToast, notifyError
  } = useStore();

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(localStorage.getItem('gv_last_sync'));
  const [kpi, setKpi] = useState<{ ca: number; beneficeNet: number | null } | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isAr = lang === 'ar';
  const isDark = theme === 'dark';
  const isOwner = currentUser?.role === 'owner';

  const refreshKpi = useCallback(async () => {
    if (!hasPermission('pos', 'view')) return;
    const res = await invokeIpcSafe<any>('get-daily-kpi', { storeId: currentStore?.id }, null);
    if (res) setKpi(res);
  }, [currentStore?.id, hasPermission]);

  useEffect(() => {
    refreshKpi();
    const interval = setInterval(refreshKpi, 60000);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshKpi]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await runFullSync(currentStore?.id || 1);
      if (res.success) {
        const stamp = new Date().toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem('gv_last_sync', stamp);
        setLastSync(stamp);
        pushToast({ kind: 'success', title: 'Synchronisation réussie', description: res.message });
      } else {
        pushToast({ kind: 'warning', title: 'Synchronisation incomplète', description: res.message });
      }
    } catch (err) {
      notifyError(err, 'Synchronisation impossible');
    } finally {
      setSyncing(false);
    }
  };

  const chipStyle = {
    backgroundColor: 'rgb(var(--gv-surface-2))',
    border: '1px solid rgb(var(--gv-border))'
  };

  return (
    <>
      <header
        className="h-14 px-4 flex items-center justify-between shrink-0 select-none gap-3"
        style={{ backgroundColor: 'rgb(var(--gv-surface))', borderBottom: '1px solid rgb(var(--gv-border))' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs min-w-0" style={chipStyle}>
            <StoreIcon className="w-4 h-4 text-blue-500 shrink-0" />
            {isOwner && stores.length > 1 ? (
              <select
                value={currentStore?.id || ''}
                onChange={e => {
                  const s = stores.find(st => st.id === Number(e.target.value));
                  if (s) setCurrentStore(s);
                }}
                className="bg-transparent font-bold outline-none cursor-pointer max-w-[14rem] truncate"
                style={{ color: 'rgb(var(--gv-text))' }}
              >
                {stores.map(s => (
                  <option key={s.id} value={s.id} style={{ backgroundColor: isDark ? '#0f172a' : '#fff', color: isDark ? '#fff' : '#0f172a' }}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold truncate">{currentStore?.name || 'Boutique'}</span>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-500" style={chipStyle}>
            <Scan className="w-3.5 h-3.5" />
            <span>{isAr ? 'القارئ جاهز' : 'Douchette prête'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {kpi && (
            <div className="hidden xl:flex items-center gap-2.5 px-3 py-1 rounded-xl" style={chipStyle}>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div className="leading-tight">
                <div className="text-[9px] uppercase font-bold gv-muted">{isAr ? 'رقم أعمال اليوم' : 'CA du jour'}</div>
                <div className="text-xs font-black font-mono text-emerald-500">{formatDZD(kpi.ca)}</div>
              </div>
              {capabilities.canSeeCost && kpi.beneficeNet !== null && (
                <div className="leading-tight ps-2.5" style={{ borderInlineStart: '1px solid rgb(var(--gv-border))' }}>
                  <div className="text-[9px] uppercase font-bold gv-muted">{isAr ? 'الربح الصافي' : 'Bénéfice net'}</div>
                  <div className={`text-xs font-black font-mono ${kpi.beneficeNet >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                    {formatDZD(kpi.beneficeNet)}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={toggleTheme} className="gv-btn-ghost !px-2.5 !py-1.5" title={isDark ? 'Mode clair' : 'Mode sombre'}>
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button onClick={() => setLang(isAr ? 'fr' : 'ar')} className="gv-btn-ghost !px-2.5 !py-1.5" title="Langue / اللغة">
            <Languages className="w-4 h-4 text-blue-500" />
            <span className="hidden md:inline">{isAr ? 'FR' : 'ع'}</span>
          </button>

          <button
            onClick={handleManualSync}
            disabled={syncing || !isOnline}
            className="gv-btn-ghost !px-2.5 !py-1.5"
            title={isOnline ? `Synchroniser avec le portail${lastSync ? ` — dernière : ${lastSync}` : ''}` : 'Hors ligne : la caisse continue de fonctionner'}
          >
            {isOnline ? (
              <RefreshCw className={`w-4 h-4 text-blue-500 ${syncing ? 'animate-spin' : ''}`} />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-500" />
            )}
            <span className="hidden md:inline">
              {syncing ? 'Envoi…' : isOnline ? (lastSync || 'Synchroniser') : 'Hors ligne'}
            </span>
          </button>

          <div className="flex items-center gap-2 ps-2" style={{ borderInlineStart: '1px solid rgb(var(--gv-border))' }}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
              style={{ backgroundColor: 'rgb(var(--gv-accent) / 0.15)', color: 'rgb(var(--gv-accent))' }}
            >
              {currentUser?.fullName?.slice(0, 2).toUpperCase() || <UserIcon className="w-4 h-4" />}
            </div>
            <div className="hidden lg:block text-start leading-tight">
              <div className="text-xs font-bold truncate max-w-[10rem]">{currentUser?.fullName}</div>
              <div className="text-[9px] font-bold uppercase text-blue-500">
                {currentUser ? (ROLE_LABELS[currentUser.role]?.split(' (')[0] || currentUser.role) : ''}
              </div>
            </div>

            <button
              onClick={onChangePassword}
              title="Changer mon mot de passe"
              className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 text-blue-500"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              onClick={() => setConfirmLogout(true)}
              title={isAr ? 'تسجيل الخروج' : 'Fermer la session'}
              className="p-1.5 rounded-lg transition-colors hover:bg-rose-500/10 text-rose-500"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={confirmLogout}
        title="Fermer la session de caisse"
        message="Votre session sera close et inscrite au journal. Les données locales restent intactes."
        confirmLabel="Se déconnecter"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          signOut();
        }}
      />
    </>
  );
};
