import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpcSafe, IpcError } from '../api/electronBridge';
import { Bike, Lock, User, ShieldCheck, Sun, Moon, Languages, AlertTriangle, Loader2, Server } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signIn, lang, setLang, theme, toggleTheme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invokeIpcSafe<any>('get-bootstrap', undefined, null).then(res => {
      if (res?.stores) setStores(res.stores);
      if (res?.deviceId) setDeviceId(res.deviceId);
    });
    usernameRef.current?.focus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(username, password);
    } catch (err) {
      const ipcErr = err as IpcError;
      setError({ message: ipcErr.message, code: ipcErr.code });
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const isLockout = error?.code === 'ACCOUNT_LOCKED';

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`min-h-screen w-screen flex flex-col items-center justify-center p-6 select-none relative overflow-hidden ${
        'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Fond décoratif discret, sans image externe (l'application reste 100 % hors ligne). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background: 'radial-gradient(60rem 40rem at 15% -10%, rgba(37,99,235,0.28), transparent 60%), radial-gradient(50rem 35rem at 110% 110%, rgba(16,185,129,0.18), transparent 60%)'
        }}
      />

      <div className="absolute top-6 end-6 flex items-center gap-2 z-10">
        <button onClick={toggleTheme} className="gv-btn-ghost" type="button">
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          <span>{isDark ? 'Clair' : 'Sombre'}</span>
        </button>
        <button onClick={() => setLang(isAr ? 'fr' : 'ar')} className="gv-btn-ghost" type="button">
          <Languages className="w-4 h-4" />
          <span>{isAr ? 'Français' : 'العربية'}</span>
        </button>
      </div>

      <div className="w-full max-w-md gv-card !p-8 space-y-6 relative z-10" style={{ boxShadow: 'var(--gv-shadow-lg)' }}>
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-600/30">
            <Bike className="w-9 h-9" />
          </div>
          <h1 className="text-xl font-black tracking-tight">
            {isAr ? 'نظام تسيير قطع الدراجات والموتو' : 'Gestion Pièces Cycles & Motos'}
          </h1>
          <p className="text-xs gv-muted">
            {isAr ? 'سجّل الدخول لفتح صندوق المحل' : 'Authentification requise pour ouvrir la caisse.'}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2.5 ${
              isLockout
                ? 'bg-amber-500/10 border border-amber-500/40 text-amber-500'
                : 'bg-rose-500/10 border border-rose-500/40 text-rose-500'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error.message}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="gv-label" htmlFor="gv-username">
              {isAr ? 'اسم المستخدم' : 'Identifiant'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-blue-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="gv-username"
                ref={usernameRef}
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={isAr ? 'أدخل اسم المستخدم' : 'Votre identifiant'}
                className="gv-input ps-10"
              />
            </div>
          </div>

          <div>
            <label className="gv-label" htmlFor="gv-password">
              {isAr ? 'كلمة المرور' : 'Mot de passe'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-emerald-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="gv-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="gv-input ps-10"
              />
            </div>
          </div>

          <button type="submit" disabled={loading || !username || !password} className="gv-btn-primary w-full !py-3">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span>
              {loading
                ? isAr ? 'جارٍ التحقق...' : 'Vérification…'
                : isAr ? 'فتح الصندوق' : 'Ouvrir la caisse'}
            </span>
          </button>
        </form>

        <div className="gv-divider" />

        <div className="flex items-center justify-between text-[10px] gv-muted">
          <span className="inline-flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            {stores.length} {isAr ? 'محل' : stores.length > 1 ? 'boutiques' : 'boutique'}
          </span>
          <span className="font-mono">{deviceId}</span>
        </div>

        <p className="text-[10px] gv-muted text-center leading-relaxed">
          {isAr
            ? 'كل عملية دخول تُسجَّل في سجل التدقيق. يُقفل الحساب مؤقتًا بعد 5 محاولات فاشلة.'
            : 'Chaque connexion est inscrite au journal d\'audit. Le compte se verrouille 15 min après 5 échecs.'}
        </p>
      </div>
    </div>
  );
};
