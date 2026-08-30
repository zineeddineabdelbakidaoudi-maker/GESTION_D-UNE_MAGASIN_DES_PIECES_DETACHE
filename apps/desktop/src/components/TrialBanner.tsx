import React, { useEffect, useState } from 'react';
import { invokeIpc } from '../api/electronBridge';
import { TrialState, calculateTrialState } from '@gestion-veloo/shared';
import { Clock, Lock, Phone, ShieldAlert } from 'lucide-react';

export const TrialBanner: React.FC = () => {
  const [trial, setTrial] = useState<TrialState | null>(null);

  useEffect(() => {
    const update = async () => {
      try {
        const state = await invokeIpc<TrialState>('get-trial-status');
        setTrial(state);
      } catch {
        // In browser dev mode fallback
        setTrial(calculateTrialState(Date.now() - 3600000)); // 23h remaining demo
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!trial) return null;

  if (trial.isExpired) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-md flex items-center justify-center p-6 text-white select-none">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/50 rounded-2xl p-8 text-center shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/30 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-red-400">Période d'Essai Terminée</h2>
            <p className="text-sm text-slate-300">
              La version de démonstration (24h) a expiré. L'accès à la caisse et aux fonctionnalités est verrouillé.
            </p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-left space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <Phone className="w-4 h-4" /> Activation Licence Complète :
            </div>
            <p>Veuillez contacter le développeur pour débloquer votre système POS définitif :</p>
            <p className="font-mono text-emerald-400 font-semibold">Tél : +213 (0) 550 XX XX XX / contact@pos-moto.dz</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 px-4 py-1.5 text-xs font-medium flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
        <span className="font-bold">{trial.message}</span>
        <span className="text-amber-700 text-[11px] hidden md:inline">
          (Démonstration fonctionnelle magasin)
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
        <ShieldAlert className="w-3 h-3 text-amber-600" />
        <span>Mode Démo Actif</span>
      </div>
    </div>
  );
};
