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

  const lowStockItems = stockList.filter(s => s.quantity <= 5);

  return (
    <div className={`p-8 space-y-8 min-h-full transition-colors ${
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
            Niveaux de stocks en direct par point de vente avec valorisation globale au prix d'achat.
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

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
          isDark ? 'bg-amber-950/30 border-amber-800/50 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Alerte Stock Bas :</span> {lowStockItems.length} article(s) ont un stock critique inférieur ou égal à 5 unités.
            </div>
          </div>
        </div>
      )}

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
              <th className="px-5 py-3.5 text-center">Quantité Dispo</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {stockList.map((item, idx) => (
              <tr key={idx} className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="px-5 py-3.5 font-mono font-bold text-blue-400">{item.productCode}</td>
                <td className="px-5 py-3.5">
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.productName}</div>
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
                      item.quantity <= 5
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : item.isCode90Recent
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : isDark ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {item.quantity}
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
