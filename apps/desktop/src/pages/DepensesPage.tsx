import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { formatDZD } from '@gestion-veloo/shared';
import {
  Receipt,
  Plus,
  Trash2,
  X,
  Filter,
  TrendingDown,
  CalendarDays,
  Tag,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ExpenseCategory {
  id: number;
  name: string;
}

interface Depense {
  id: number;
  storeId: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  note: string;
  userName: string;
  storeName: string;
  depenseDate: string;
  createdAt: string;
}

export const DepensesPage: React.FC = () => {
  const { currentStore, currentUser, lang, theme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [totalMonth, setTotalMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState<number | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Add Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState<number | ''>('');
  const [newAmount, setNewAmount] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, deps] = await Promise.all([
        invokeIpc<ExpenseCategory[]>('get-expense-categories'),
        invokeIpc<Depense[]>('get-depenses', {
          storeId: currentStore?.id,
          categoryId: filterCategory || undefined,
          dateFrom: filterDateFrom || undefined,
          dateTo: filterDateTo || undefined
        })
      ]);
      setCategories(cats || []);
      setDepenses(deps || []);

      // Total for current month
      const now = new Date();
      const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const monthTotal = await invokeIpc<number>('get-depenses-total', {
        storeId: currentStore?.id,
        dateFrom: firstDay,
        dateTo: lastDay
      });
      setTotalMonth(monthTotal || 0);
    } catch (err) {
      console.error('Depenses load error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentStore, filterCategory, filterDateFrom, filterDateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!newCategoryId || !newAmount || parseFloat(newAmount) <= 0) {
      setError(isAr ? 'يجب اختيار الفئة والمبلغ' : 'Veuillez choisir une catégorie et saisir un montant valide');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await invokeIpc('create-depense', {
        storeId: currentStore?.id || 1,
        categoryId: newCategoryId,
        amount: Math.round(parseFloat(newAmount) * 100),
        note: newNote,
        userId: currentUser?.id || 1,
        depenseDate: newDate
      });
      setSuccess(true);
      setShowAddModal(false);
      setNewCategoryId('');
      setNewAmount('');
      setNewNote('');
      setNewDate(new Date().toISOString().slice(0, 10));
      setTimeout(() => setSuccess(false), 3000);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(isAr ? 'حذف هذه النفقة؟' : 'Supprimer cette dépense ?')) return;
    await invokeIpc('delete-depense', id);
    loadData();
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-DZ'); } catch { return d; }
  };

  const getCategoryColor = (catId: number) => {
    const palette = [
      'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'bg-orange-500/20 text-orange-300 border-orange-500/30',
      'bg-green-500/20 text-green-300 border-green-500/30',
      'bg-pink-500/20 text-pink-300 border-pink-500/30',
      'bg-teal-500/20 text-teal-300 border-teal-500/30',
      'bg-slate-500/20 text-slate-300 border-slate-500/30'
    ];
    return palette[(catId - 1) % palette.length];
  };

  const totalFiltered = depenses.reduce((sum, d) => sum + d.amount, 0);

  const base = isDark
    ? 'bg-slate-950 text-white'
    : 'bg-slate-50 text-slate-900';
  const card = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const inputCls = isDark
    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500';

  return (
    <div className={`flex flex-col h-full ${base}`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center shadow-md shadow-rose-600/30">
            <TrendingDown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {isAr ? 'المصاريف والنفقات' : 'Dépenses & Charges'}
            </h1>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {currentStore?.name || (isAr ? 'كل المتاجر' : 'Tous les magasins')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Monthly total badge */}
          <div className={`px-4 py-2 rounded-xl border ${isDark ? 'bg-rose-950/50 border-rose-800/50' : 'bg-rose-50 border-rose-200'}`}>
            <p className={`text-[10px] font-bold uppercase ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
              {isAr ? 'إجمالي هذا الشهر' : 'Total ce mois'}
            </p>
            <p className="text-lg font-black text-rose-400">{formatDZD(totalMonth)}</p>
          </div>

          <button
            onClick={() => { setShowAddModal(true); setError(''); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            {isAr ? 'إضافة نفقة' : 'Ajouter une Dépense'}
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {success && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 px-4 py-2.5 rounded-xl text-sm font-bold">
          <CheckCircle2 className="w-4 h-4" />
          {isAr ? 'تم تسجيل النفقة بنجاح' : 'Dépense enregistrée avec succès'}
        </div>
      )}

      {/* Filters */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} flex items-center gap-3 flex-wrap`}>
        <Filter className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value ? Number(e.target.value) : '')}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${inputCls}`}
        >
          <option value="">{isAr ? 'كل الفئات' : 'Toutes les catégories'}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <CalendarDays className={`w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${inputCls}`}
          />
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>→</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${inputCls}`}
          />
        </div>
        {(filterCategory || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterCategory(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> {isAr ? 'مسح' : 'Effacer'}
          </button>
        )}
        {depenses.length > 0 && (
          <div className="ml-auto text-xs font-bold text-rose-400">
            {isAr ? 'المجموع المصفى:' : 'Total filtré:'} {formatDZD(totalFiltered)}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : depenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Receipt className={`w-12 h-12 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
            <p className={`text-sm font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {isAr ? 'لا توجد نفقات مسجلة' : 'Aucune dépense enregistrée'}
            </p>
          </div>
        ) : (
          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                  <th className={`text-left px-4 py-3 font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className={`text-left px-4 py-3 font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isAr ? 'الفئة' : 'Catégorie'}</th>
                  <th className={`text-left px-4 py-3 font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isAr ? 'المبلغ' : 'Montant'}</th>
                  <th className={`text-left px-4 py-3 font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isAr ? 'ملاحظة' : 'Note'}</th>
                  <th className={`text-left px-4 py-3 font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{isAr ? 'بواسطة' : 'Par'}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {depenses.map((d, idx) => (
                  <tr
                    key={d.id}
                    className={`border-b transition-colors ${
                      isDark
                        ? 'border-slate-800/50 hover:bg-slate-800/30'
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <td className={`px-4 py-3 font-mono font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {formatDate(d.depenseDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${getCategoryColor(d.categoryId)}`}>
                        <Tag className="w-3 h-3" />
                        {d.categoryName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-black text-rose-400 text-sm">{formatDZD(d.amount)}</span>
                    </td>
                    <td className={`px-4 py-3 max-w-[200px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {d.note || '—'}
                    </td>
                    <td className={`px-4 py-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{d.userName}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 transition-colors"
                        title={isAr ? 'حذف' : 'Supprimer'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Depense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center justify-between p-5 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-rose-400" />
                <h2 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {isAr ? 'تسجيل نفقة جديدة' : 'Enregistrer une Dépense'}
                </h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-rose-950/50 border border-rose-800/50 text-rose-300 px-3 py-2 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {isAr ? 'نوع النفقة *' : 'Type de Dépense *'}
                </label>
                <select
                  value={newCategoryId}
                  onChange={e => setNewCategoryId(Number(e.target.value))}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm font-medium ${inputCls}`}
                >
                  <option value="">{isAr ? 'اختر الفئة...' : 'Choisir la catégorie...'}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {isAr ? 'المبلغ (DA) *' : 'Montant (DA) *'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  placeholder={isAr ? 'مثال: 5000' : 'ex: 5000'}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono font-bold ${inputCls}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {isAr ? 'التاريخ' : 'Date'}
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm ${inputCls}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {isAr ? 'ملاحظة (اختياري)' : 'Note (optionnel)'}
                </label>
                <textarea
                  rows={2}
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder={isAr ? 'تفاصيل إضافية...' : 'Détails supplémentaires...'}
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none ${inputCls}`}
                />
              </div>
            </div>

            <div className={`flex gap-3 p-5 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <button
                onClick={() => setShowAddModal(false)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
                  isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {isAr ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/30 disabled:opacity-50 transition-all"
              >
                {saving ? '...' : (isAr ? 'تسجيل النفقة' : 'Enregistrer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
