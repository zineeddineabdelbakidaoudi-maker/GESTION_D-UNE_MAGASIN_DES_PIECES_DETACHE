import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { apiRequest, getApiBase } from '../api/client';
import { Bike, KeyRound, Lock, User, Server, CheckCircle2, RefreshCw, AlertTriangle, Settings } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'sleeping' | 'error'>('checking');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState(localStorage.getItem('gv_custom_api_url') || '');
  const { login } = useAuthStore();

  const currentApiBase = getApiBase();

  const checkServer = async () => {
    setServerStatus('checking');
    try {
      const res = await fetch(`${currentApiBase}/health`, { method: 'GET' });
      if (res.ok) {
        setServerStatus('connected');
      } else {
        setServerStatus('sleeping');
      }
    } catch {
      setServerStatus('sleeping');
    }
  };

  useEffect(() => {
    checkServer();
    const interval = setInterval(checkServer, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customApiUrl.trim()) {
      localStorage.setItem('gv_custom_api_url', customApiUrl.trim());
    } else {
      localStorage.removeItem('gv_custom_api_url');
    }
    setShowServerConfig(false);
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiRequest<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      login(data.token, data.user);
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setError('Impossible de joindre le serveur API. Le serveur est peut-être en train de se réveiller (comptez ~20 secondes) ou vérifiez votre connexion.');
      } else {
        setError(err.message || 'Identifiants invalides');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-500 text-slate-950 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 font-bold">
            <Bike className="w-9 h-9" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Portail Propriétaire</h2>
          <p className="text-sm text-slate-400">Gestion Multi-Boutique Pièces Cycles & Motos</p>
        </div>

        {/* Server Status Badge */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-400" />
            {serverStatus === 'checking' && (
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" /> Vérification serveur...
              </span>
            )}
            {serverStatus === 'connected' && (
              <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Serveur Cloud Connecté
              </span>
            )}
            {serverStatus === 'sleeping' && (
              <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Serveur en réveil (Render)...
              </span>
            )}
            {serverStatus === 'error' && (
              <span className="text-rose-400 flex items-center gap-1.5 font-bold">
                ● Erreur de connexion
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={checkServer}
              title="Tester la connexion"
              className="p-1 rounded text-slate-400 hover:text-white"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              title="Configurer l'adresse API"
              className="p-1 rounded text-slate-400 hover:text-cyan-400"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Custom Server Config Modal / Collapsible */}
        {showServerConfig && (
          <form onSubmit={handleSaveApiUrl} className="p-3.5 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-2.5 text-xs">
            <p className="font-bold text-cyan-300">Adresse API du Serveur Central</p>
            <input
              type="text"
              value={customApiUrl}
              onChange={e => setCustomApiUrl(e.target.value)}
              placeholder="https://gestion-veloo-server.onrender.com"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
            <p className="text-[10px] text-slate-400">Actuel : {currentApiBase}</p>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold"
              >
                Enregistrer & Recharger
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('gv_custom_api_url');
                  setCustomApiUrl('');
                  window.location.reload();
                }}
                className="px-2 py-1.5 text-slate-400 hover:text-white"
              >
                Réinitialiser
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Identifiant</label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="Ex: admin"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Mot de passe</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{loading ? 'Connexion en cours...' : 'Accéder au Tableau de Bord'}</span>
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 border-t border-slate-800/80 pt-4">
          <p>Compte démo gérant : <code className="text-emerald-400">admin / admin123</code></p>
        </div>
      </div>
    </div>
  );
};
