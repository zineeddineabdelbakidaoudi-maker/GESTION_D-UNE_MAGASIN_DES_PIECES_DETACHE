import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { apiRequest } from '../api/client';
import { formatDZD } from '@gestion-veloo/shared';
import { Boxes, Search, AlertCircle, TrendingDown, DollarSign, ArrowLeftRight } from 'lucide-react';

interface StockRow {
  productId: number;
  productCode: string;
  productName: string;
  priceAchat: number;
  priceDetail: number;
  categoryName: string;
  brandName: string;
  storeId: number;
  storeName: string;
  quantity: number;
  isCode90Recent: boolean;
  recentQtyBefore: number | null;
  recentQtyAfter: number | null;
}

export const StockOverviewPage: React.FC = () => {
  const { selectedStoreId, theme } = useAuthStore();
  const isDark = theme === 'dark';

  const [stockList, setStockList] = useState<StockRow[]>([]);
  const [search, setSearch] = useState('');
  const [capital, setCapital] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const loadStock = async () => {
    setLoading(true);
    try {
      let endpoint = `/stock?`;
      if (selectedStoreId) endpoint += `&storeId=${selectedStoreId}`;
      if (search) endpoint += `&q=${encodeURIComponent(search)}`;

      const [stockData, capitalData] = await Promise.all([
        apiRequest<StockRow[]>(endpoint),
        apiRequest<{ capital: number }>(`/products/capital${selectedStoreId ? `?storeId=${selectedStoreId}` : ''}`)
      ]);

      setStockList(stockData || []);
      setCapital(capitalData?.capital || 0);
    } catch (err) {
      console.error('Stock overview load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, [selectedStoreId, search]);

  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  const totalOut = stockList.filter(s => s.quantity <= 0).length;
  const totalLow = stockList.filter(s => s.quantity > 0 && s.quantity <= 5).length;

  const filteredList = stockList.filter(s => {
    if (stockStatusFilter === 'out') return s.quantity <= 0;
    if (stockStatusFilter === 'low') return s.quantity > 0 && s.quantity <= 5;
    return true;
  });

  return (
    <div className={`p-8 space-y-6 min-h-full transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Header with Capital KPI */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black tracking-tight flex items-center gap-2.5 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <Boxes className="w-6 h-6 text-blue-500" />
            <span>Vue Stock Multi-Boutiques & Valeur</span>
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Niveaux de stocks en direct par point de vente avec alertes de rupture et valorisation marchande.
          </p>
        </div>

        {/* Capital Badge */}
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-sm ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block leading-none">Valeur Marchande (Capital)</span>
            <span className="text-lg font-black text-emerald-400 font-mono leading-tight">{formatDZD(capital)}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs Chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setStockStatusFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
            stockStatusFilter === 'all'
              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
              : isDark ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Tous les articles</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>{stockList.length}</span>
        </button>

        <button
          onClick={() => setStockStatusFilter('low')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
            stockStatusFilter === 'low'
              ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-600/30'
              : isDark ? 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-950/50' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <span>⚠️</span>
          <span>Stock Faible (≤ 5)</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 text-[10px] font-mono font-black">{totalLow}</span>
        </button>

        <button
          onClick={() => setStockStatusFilter('out')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
            stockStatusFilter === 'out'
              ? 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/30'
              : isDark ? 'bg-rose-950/30 border-rose-800/40 text-rose-300 hover:bg-rose-950/50' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
          }`}
        >
          <span>🚨</span>
          <span>Rupture de Stock (0)</span>
          <span className="px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 text-[10px] font-mono font-black">{totalOut}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className={`p-3 rounded-2xl border flex items-center gap-3 shadow-sm ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par référence, désignation, marque..."
          className={`w-full bg-transparent text-xs font-bold outline-none ${
            isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
          }`}
        />
      </div>

      {/* Stock Table */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <table className="w-full text-left text-xs">
          <thead className={`uppercase font-bold border-b ${
            isDark ? 'bg-slate-800/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <tr>
              <th className="px-5 py-3.5">Référence</th>
              <th className="px-5 py-3.5">Désignation</th>
              <th className="px-5 py-3.5">Boutique</th>
              <th className="px-5 py-3.5 text-right">Prix Achat</th>
              <th className="px-5 py-3.5 text-right">Prix Vente (Détail)</th>
              <th className="px-5 py-3.5 text-center">Quantité & État</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {filteredList.map((item, idx) => (
              <tr key={idx} className={`${
                item.quantity <= 0 
                  ? isDark ? 'bg-rose-950/20 hover:bg-rose-950/30' : 'bg-rose-50/50 hover:bg-rose-100/50' 
                  : item.quantity <= 5 
                    ? isDark ? 'bg-amber-950/10 hover:bg-amber-950/20' : 'bg-amber-50/50 hover:bg-amber-100/50' 
                    : isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
              }`}>
                <td className="px-5 py-3.5 font-mono font-bold text-blue-400">{item.productCode}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.productName}</span>
                    {item.quantity <= 0 ? (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[10px] font-black animate-pulse">
                        🚨 RUPTURE
                      </span>
                    ) : item.quantity <= 5 ? (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-black">
                        ⚠️ FAIBLE
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-slate-400">{item.categoryName} • {item.brandName}</div>
                </td>
                <td className="px-5 py-3.5 font-medium text-slate-400">{item.storeName}</td>
                <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-400">{formatDZD(item.priceAchat)}</td>
                <td className={`px-5 py-3.5 text-right font-mono font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{formatDZD(item.priceDetail)}</td>
                <td className="px-5 py-3.5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {item.isCode90Recent && item.recentQtyBefore !== null && (
                      <span className="line-through text-rose-400 font-mono text-[11px] font-bold">
                        {item.recentQtyBefore}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-xl font-mono font-bold text-xs ${
                      item.quantity <= 0
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 font-black'
                        : item.quantity <= 5
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-black'
                          : item.isCode90Recent
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {item.quantity} {item.quantity <= 0 ? '(Rupture)' : ''}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
