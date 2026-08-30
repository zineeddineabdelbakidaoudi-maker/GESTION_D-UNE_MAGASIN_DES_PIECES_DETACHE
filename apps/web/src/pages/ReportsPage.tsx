import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { apiRequest } from '../api/client';
import { ReportSummary, formatDZD } from '@gestion-veloo/shared';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  CreditCard, 
  Truck, 
  Calendar, 
  ArrowUpRight,
  Package,
  Award
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend
} from 'recharts';

export const ReportsPage: React.FC = () => {
  const { selectedStoreId, theme } = useAuthStore();
  const isDark = theme === 'dark';

  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('month');
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      let endpoint = `/reports?period=${period}`;
      if (selectedStoreId) endpoint += `&storeId=${selectedStoreId}`;
      const res = await apiRequest<ReportSummary>(endpoint);
      setData(res);
    } catch (err) {
      console.error('Reports load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, selectedStoreId]);

  return (
    <div className={`p-8 space-y-8 min-h-full transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Rapports & Rentabilité Consolidée
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Aperçu des performances financières, marges bénéficiaires et arriérés clients des 2 boutiques.
          </p>
        </div>

        {/* Period Selector */}
        <div className={`p-1.5 rounded-2xl border flex items-center gap-1.5 shadow-sm ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {[
            { id: 'day', label: 'Jour' },
            { id: 'week', label: 'Semaine' },
            { id: 'month', label: 'Mois' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === p.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className={`p-5 rounded-3xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Chiffre d'Affaires</span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-2xl font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {formatDZD(data.totalCA)}
            </div>
          </div>

          <div className={`p-5 rounded-3xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Bénéfices Nets (35%)</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {formatDZD(data.totalBenefices)}
            </div>
          </div>

          <div className={`p-5 rounded-3xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Ventes Réalisées</span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-2xl font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {data.salesCount}
            </div>
          </div>

          <div className={`p-5 rounded-3xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Dettes Clients</span>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-400 font-mono">
              {formatDZD(data.totalDetteClients)}
            </div>
          </div>
        </div>
      )}

      {/* Chart & Top Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className={`lg:col-span-2 p-6 rounded-3xl border shadow-sm space-y-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Calendar className="w-4 h-4 text-blue-500" />
            <span>Évolution des Recettes & Marges</span>
          </h3>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.chartData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="date" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
                <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} tickFormatter={v => `${(v / 100).toLocaleString('fr-DZ')} DA`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#cbd5e1',
                    borderRadius: '12px',
                    color: isDark ? '#ffffff' : '#0f172a'
                  }}
                  formatter={(value: any) => formatDZD(Number(value))}
                />
                <Legend />
                <Line type="monotone" dataKey="ca" name="Chiffre d'Affaires" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="benefice" name="Bénéfice Net" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className={`p-6 rounded-3xl border shadow-sm space-y-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Award className="w-4 h-4 text-amber-500" />
            <span>Top Articles Vendus</span>
          </h3>

          <div className="space-y-3">
            {data?.topProducts?.map((p: any, idx: number) => (
              <div key={idx} className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.productName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{p.code} • {p.qtySold} vendus</div>
                </div>
                <span className="font-mono font-black text-emerald-400">{formatDZD(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
