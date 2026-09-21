import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpcSafe } from '../api/electronBridge';
import { runFullSync } from '../api/syncEngine';
import { formatDZD, ROLE_LABELS } from '@gestion-veloo/shared';
import { ConfirmDialog } from './ui';
import {
  Scan, RefreshCw, Languages, Store as StoreIcon, Bike,
  Sun, Moon, LogOut, TrendingUp, WifiOff, KeyRound, ChevronDown
} from 'lucide-react';

interface HeaderProps {
  onChangePassword: () => void;
}

/**
 * Barre supérieure : identité de l'application, boutique active, indicateurs du
 * jour et compte connecté. La navigation par module vit juste en dessous
 * (`TabStrip`), ce qui libère toute la largeur de l'écran pour le travail.
 */
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
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Le menu du compte se ferme dès qu'on clique ailleurs.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

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

  const chip = {
    backgroundColor: 'rgb(var(--gv-surface-2))',
    border: '1px solid rgb(var(--gv-border))'
  };

  return (
    <>
      <header
        className="h-16 px-4 flex items-center justify-between shrink-0 select-none gap-3"
        style={{ backgroundColor: 'rgb(var(--gv-surface))', borderBottom: '1px solid rgb(var(--gv-border))' }}
      >
        {/* Identité + boutique active */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/25">
              <Bike className="w-5 h-5" />
            </div>
            <div className="hidden md:block leading-tight">
              <div className="text-sm font-black tracking-tight">
                {isAr ? 'قطع الدراجات والموتو' : 'Cycles & Motos'}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-500">
                {isAr ? 'نقطة البيع' : 'Point de vente'}
              </div>
            </div>
          </div>

          <div className="w-px h-8 shrink-0" style={{ backgroundColor: 'rgb(var(--gv-border))' }} />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs min-w-0" style={chip}>
            <StoreIcon className="w-4 h-4 text-blue-500 shrink-0" />
            {isOwner && stores.length > 1 ? (
              <select
                value={currentStore?.id || ''}
                onChange={e => {
                  const s = stores.find(st => st.id === Number(e.target.value));
                  if (s) setCurrentStore(s);
                }}
                className="bg-transparent font-bold outline-none cursor-pointer max-w-[13rem] truncate"
                style={{ color: 'rgb(var(--gv-text))' }}
                aria-label="Boutique active"
              >
                {stores.map(s => (
                  <option
                    key={s.id}
                    value={s.id}
                    style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#ffffff' : '#0f172a' }}
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-bold truncate">{currentStore?.name || 'Boutique'}</span>
            )}
          </div>

          <div
            className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-500"
            style={chip}
          >
            <Scan className="w-3.5 h-3.5" />
            <span>{isAr ? 'القارئ جاهز' : 'Douchette prête'}</span>
          </div>
        </div>

        {/* Indicateurs + commandes */}
        <div className="flex items-center gap-2 shrink-0">
          {kpi && (
            <div className="hidden lg:flex items-center gap-3 px-3.5 py-1.5 rounded-xl" style={chip}>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="text-[9px] uppercase font-bold gv-muted">{isAr ? 'رقم أعمال اليوم' : 'CA du jour'}</div>
                <div className="text-sm font-black font-mono text-emerald-500">{formatDZD(kpi.ca)}</div>
              </div>
              {capabilities.canSeeCost && kpi.beneficeNet !== null && (
                <div className="leading-tight ps-3" style={{ borderInlineStart: '1px solid rgb(var(--gv-border))' }}>
                  <div className="text-[9px] uppercase font-bold gv-muted">{isAr ? 'الربح الصافي' : 'Bénéfice net'}</div>
                  <div className={`text-sm font-black font-mono ${kpi.beneficeNet >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                    {formatDZD(kpi.beneficeNet)}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleManualSync}
            disabled={syncing || !isOnline}
            className="gv-btn-ghost !px-2.5 !py-2"
            title={
              isOnline
                ? `Synchroniser avec le portail${lastSync ? ` — dernière : ${lastSync}` : ''}`
                : 'Hors ligne : la caisse continue de fonctionner normalement'
            }
          >
            {isOnline ? (
              <RefreshCw className={`w-4 h-4 text-blue-500 ${syncing ? 'animate-spin' : ''}`} />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-500" />
            )}
            <span className="hidden xl:inline">
              {syncing ? 'Envoi…' : isOnline ? lastSync || 'Synchroniser' : 'Hors ligne'}
            </span>
          </button>

          <button onClick={toggleTheme} className="gv-btn-ghost !px-2.5 !py-2" title={isDark ? 'Mode clair' : 'Mode sombre'}>
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button onClick={() => setLang(isAr ? 'fr' : 'ar')} className="gv-btn-ghost !px-2.5 !py-2" title="Langue / اللغة">
            <Languages className="w-4 h-4 text-blue-500" />
            <span className="hidden md:inline">{isAr ? 'FR' : 'ع'}</span>
          </button>

          {/* Menu du compte connecté */}
          <div className="relative" onMouseDown={e => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 ps-1.5 pe-2 py-1.5 rounded-xl transition-colors hover:bg-[rgb(var(--gv-surface-2))]"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shrink-0"
                style={{ backgroundColor: 'rgb(var(--gv-accent) / 0.15)', color: 'rgb(var(--gv-accent))' }}
              >
                {currentUser?.fullName?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div className="hidden lg:block text-start leading-tight">
                <div className="text-xs font-bold truncate max-w-[9rem]">{currentUser?.fullName}</div>
                <div className="text-[9px] font-bold uppercase text-blue-500">
                  {currentUser ? ROLE_LABELS[currentUser.role]?.split(' (')[0] : ''}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 gv-muted" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute end-0 top-full mt-2 w-60 rounded-xl overflow-hidden z-50 gv-animate-in"
                style={{
                  backgroundColor: 'rgb(var(--gv-surface))',
                  border: '1px solid rgb(var(--gv-border-strong))',
                  boxShadow: 'var(--gv-shadow-lg)'
                }}
              >
                <div className="px-3.5 py-3" style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}>
                  <div className="text-xs font-bold truncate">{currentUser?.fullName}</div>
                  <div className="text-[10px] gv-muted font-mono">@{currentUser?.username}</div>
                  <div className="text-[10px] gv-muted mt-1">
                    {currentUser ? ROLE_LABELS[currentUser.role] : ''}
                  </div>
                </div>

                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onChangePassword(); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold hover:bg-[rgb(var(--gv-surface-2))] transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-blue-500" />
                  {isAr ? 'تغيير كلمة المرور' : 'Changer mon mot de passe'}
                </button>

                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setConfirmLogout(true); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                  style={{ borderTop: '1px solid rgb(var(--gv-border))' }}
                >
                  <LogOut className="w-4 h-4" />
                  {isAr ? 'تسجيل الخروج' : 'Fermer la session'}
                </button>
              </div>
            )}
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
