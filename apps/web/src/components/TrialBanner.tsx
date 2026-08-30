import React, { useEffect, useState } from 'react';
import { fetchTrialStatus } from '../api/client';
import { TrialState } from '@gestion-veloo/shared';
import { AlertTriangle, Clock, Lock, Phone, ShieldAlert } from 'lucide-react';

export const TrialBanner: React.FC = () => {
  const [trial, setTrial] = useState<TrialState | null>(null);

  useEffect(() => {
    const update = async () => {
      try {
        const data = await fetchTrialStatus();
        setTrial(data);
      } catch (err) {
        console.error('Trial fetch error:', err);
      }
    };

    update();
    const interval = setInterval(update, 60000); // refresh every minute

    const handleExpired = () => {
      setTrial(prev => prev ? { ...prev, isExpired: true, message: "Version d'essai expirée — contactez le développeur pour la version complète." } : null);
    };

    window.addEventListener('trial_expired', handleExpired);
    return () => {
      clearInterval(interval);
      window.removeEventListener('trial_expired', handleExpired);
    };
  }, []);

  if (!trial) return null;

  if (trial.isExpired) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/50 rounded-2xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/30 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-red-400">Période d'Essai Expirée</h2>
            <p className="text-sm text-slate-300">
              La démonstration de 24 heures du système de gestion multi-boutique est arrivée à son terme.
            </p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-left space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Phone className="w-4 h-4" /> Contact Développeur :
            </div>
            <p>Pour débloquer la version complète illimitée et installer le système sur vos boutiques :</p>
            <p className="font-mono text-emerald-400 font-semibold">Tél : +213 (0) 550 XX XX XX / dev@algerie-pos.dz</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 px-4 py-2 text-xs font-medium flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
        <span className="font-semibold">{trial.message}</span>
        <span className="text-amber-700 text-[11px] hidden md:inline">
          (Démonstration fonctionnelle limitée à 24h)
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
        <span>Mode Démo Actif</span>
      </div>
    </div>
  );
};
