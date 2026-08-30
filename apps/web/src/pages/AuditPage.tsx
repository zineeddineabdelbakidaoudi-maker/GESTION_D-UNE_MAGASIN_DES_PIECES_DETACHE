import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { apiRequest } from '../api/client';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';
import { History, Filter, ArrowDownRight, ArrowUpRight, RefreshCw, Sparkles, User, Store as StoreIcon } from 'lucide-react';

interface MovementRecord {
  id: number;
  productId: number;
  storeId: number;
  movementCode: number;
  qtyBefore: number;
  qtyAfter: number;
  delta: number;
  userId: number;
  refType: string;
  refId: number | null;
  createdAt: string;
  productCode: string;
  productName: string;
  storeName: string;
  userName: string;
  codeLabel: string;
}

export const AuditPage: React.FC = () => {
  const { selectedStoreId, theme } = useAuthStore();
  const isDark = theme === 'dark';

  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('90');
  const [loading, setLoading] = useState(true);

  const loadMovements = async () => {
    setLoading(true);
    try {
      let endpoint = `/audit/stock-movements?limit=300`;
      if (selectedCode) endpoint += `&code=${selectedCode}`;
      if (selectedStoreId) endpoint += `&storeId=${selectedStoreId}`;

      const res = await apiRequest<MovementRecord[]>(endpoint);
      setMovements(res || []);
    } catch (err) {
      console.error('Audit fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [selectedCode, selectedStoreId]);

  return (
    <div className={`p-8 space-y-6 min-h-full transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Journal d'Audit des Mouvements
            </h1>
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Traçabilité Complète
            </span>
          </div>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Registre immuable des flux de stock avec mise en évidence des réassorts (Code 90), ventes, retours et transferts.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className={`p-1.5 rounded-2xl border flex flex-wrap items-center gap-1.5 shadow-sm ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {[
            { code: '', label: 'Tous les flux' },
            { code: '90', label: 'Code 90 (Achats)' },
            { code: '91', label: 'Code 91 (Ventes)' },
            { code: '92', label: 'Code 92 (Retours)' },
            { code: '93', label: 'Code 93 (Ajustements)' },
            { code: '94', label: 'Codes 94/95 (Transferts)' }
          ].map(btn => (
            <button
              key={btn.code}
              onClick={() => setSelectedCode(btn.code)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                selectedCode === btn.code
                  ? 'bg-blue-600 text-white shadow-md'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Movements Table */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <table className="w-full text-left text-xs">
          <thead className={`uppercase font-bold border-b ${
            isDark ? 'bg-slate-800/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <tr>
              <th className="px-5 py-3.5">Code & Type</th>
              <th className="px-5 py-3.5">Article</th>
              <th className="px-5 py-3.5">Boutique</th>
              <th className="px-5 py-3.5 text-center">Évolution (Ancien → Nouveau)</th>
              <th className="px-5 py-3.5 text-right">Variation (Δ)</th>
              <th className="px-5 py-3.5">Opérateur</th>
              <th className="px-5 py-3.5">Date & Heure</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {movements.map(m => {
              const isCode90 = m.movementCode === 90;
              const isPositive = m.delta > 0;
              return (
                <tr key={m.id} className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] border inline-flex items-center gap-1 ${
                      isCode90
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : m.movementCode === 91
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : m.movementCode === 92
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}>
                      Code {m.movementCode}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{m.productName}</div>
                    <div className="font-mono text-[10px] text-slate-400">{m.productCode}</div>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-400">{m.storeName}</td>
                  <td className="px-5 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-2 font-mono font-bold text-xs">
                      <span className="line-through text-rose-400">{m.qtyBefore}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-emerald-400">{m.qtyAfter}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold">
                    <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                      {isPositive ? `+${m.delta}` : m.delta}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-300">{m.userName}</td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">
                    {new Date(m.createdAt).toLocaleString('fr-DZ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
