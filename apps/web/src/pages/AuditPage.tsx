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
  const [selectedMovement, setSelectedMovement] = useState<MovementRecord | null>(null);
  const [saleDetail, setSaleDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleOpenDetail = async (m: MovementRecord) => {
    setSelectedMovement(m);
    setSaleDetail(null);
    if (m.refType === 'sale' && m.refId) {
      setLoadingDetail(true);
      try {
        const sale = await apiRequest<any>(`/sales/${m.refId}`);
        setSaleDetail(sale);
      } catch (err) {
        console.error('Failed to load sale details:', err);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

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
                <tr 
                  key={m.id} 
                  onDoubleClick={() => handleOpenDetail(m)}
                  onClick={() => handleOpenDetail(m)}
                  className={`cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-slate-800/60' : 'hover:bg-blue-50/60'
                  }`}
                  title="Cliquez pour inspecter les détails complets de la vente"
                >
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
                  <td className="px-5 py-3.5 font-medium text-slate-300">{m.userName || 'Système'}</td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">
                    {new Date(m.createdAt).toLocaleString('fr-DZ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden ${
            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`p-6 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-black text-sm border ${
                  selectedMovement.movementCode === 90
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : selectedMovement.movementCode === 91
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                }`}>
                  #{selectedMovement.movementCode}
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">
                    {selectedMovement.movementCode === 91 ? 'Détails de la Vente POS' : selectedMovement.movementCode === 90 ? 'Détails du Réassort / Achat' : 'Détails du Mouvement de Stock'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedMovement.storeName} • {new Date(selectedMovement.createdAt).toLocaleString('fr-DZ')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedMovement(null); setSaleDetail(null); }}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-600'
                }`}
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Movement Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Article impacté</p>
                  <p className="text-sm font-bold truncate mt-0.5">{selectedMovement.productName}</p>
                  <p className="text-xs font-mono text-blue-400">{selectedMovement.productCode}</p>
                </div>
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Évolution Stock</p>
                  <p className="text-sm font-black font-mono mt-0.5">
                    {selectedMovement.qtyBefore} → {selectedMovement.qtyAfter}
                  </p>
                  <p className={`text-xs font-bold font-mono ${selectedMovement.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Variation: {selectedMovement.delta > 0 ? `+${selectedMovement.delta}` : selectedMovement.delta}
                  </p>
                </div>
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Opérateur</p>
                  <p className="text-sm font-bold truncate mt-0.5">{selectedMovement.userName || 'Caissier'}</p>
                  <p className="text-xs text-slate-400">Réf: {selectedMovement.refType || 'mouvement'} #{selectedMovement.refId || selectedMovement.id}</p>
                </div>
              </div>

              {/* Complete Associated Sale Basket (if sale) */}
              {loadingDetail ? (
                <div className="py-8 text-center text-slate-400 text-xs animate-pulse">
                  Chargement des détails du panier de vente...
                </div>
              ) : saleDetail ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                      Tous les articles de ce ticket de caisse (Vente #{saleDetail.id})
                    </h3>
                    <span className="text-xs font-mono font-black text-emerald-400">
                      Total: {(saleDetail.total / 100).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA
                    </span>
                  </div>

                  <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-800 bg-slate-800/20' : 'border-slate-200 bg-slate-50'}`}>
                    <table className="w-full text-xs text-left">
                      <thead className={`border-b ${isDark ? 'border-slate-800 bg-slate-800/60 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                        <tr>
                          <th className="px-4 py-2.5">Article</th>
                          <th className="px-4 py-2.5 text-center">Quantité</th>
                          <th className="px-4 py-2.5 text-right">Prix Unitaire</th>
                          <th className="px-4 py-2.5 text-right">Total Ligne</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                        {saleDetail.items?.map((it: any, idx: number) => (
                          <tr key={idx} className={it.product_id === selectedMovement.productId ? (isDark ? 'bg-blue-950/30 font-bold' : 'bg-blue-50 font-bold') : ''}>
                            <td className="px-4 py-2.5">
                              <div>{it.product_name}</div>
                              <div className="text-[10px] font-mono text-slate-400">{it.product_code}</div>
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono font-bold">
                              {it.qty}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {(it.unit_price / 100).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">
                              {(it.line_total / 100).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 px-1">
                    <span className="text-slate-400">Mode de paiement: <strong className="text-white">{saleDetail.payment_type || 'cash'}</strong></span>
                    <span className="text-slate-400">Client: <strong className="text-white">{saleDetail.client_name || 'Client Comptoir'}</strong></span>
                    <span className="text-slate-400">Versé: <strong className="text-white">{((saleDetail.amount_paid || saleDetail.total) / 100).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA</strong></span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`p-4 border-t flex justify-end ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
              <button
                onClick={() => { setSelectedMovement(null); setSaleDetail(null); }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
