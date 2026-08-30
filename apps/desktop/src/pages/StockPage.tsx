import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';
import { formatDZD } from '@gestion-veloo/shared';
import { 
  Boxes, 
  Search, 
  ArrowRightLeft, 
  Edit3, 
  Sparkles, 
  RefreshCw, 
  History,
  Filter,
  CheckCircle2,
  X,
  TrendingDown,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';

interface StockItem {
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
  lastMovementCode: number | null;
  hasRecentMovement: boolean;
  isCode90Recent: boolean;
  recentQtyBefore: number | null;
  recentQtyAfter: number | null;
  lastMovementDate: string | null;
}

export const StockPage: React.FC = () => {
  const { currentStore, currentUser, hasPermission, lang } = useStore();
  const isAr = lang === 'ar';

  const [activeView, setActiveView] = useState<'table' | 'history'>('table');
  const [stockList, setStockList] = useState<StockItem[]>([]);
  const [movementsHistory, setMovementsHistory] = useState<any[]>([]);
  const [selectedMovementFilter, setSelectedMovementFilter] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Manual Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Inter-Store Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferItem, setTransferItem] = useState<StockItem | null>(null);
  const [transferQty, setTransferQty] = useState('1');
  const [toStoreId, setToStoreId] = useState<number>(2);
  const [transferNote, setTransferNote] = useState('');

  const loadStock = async () => {
    setLoading(true);
    try {
      const [stocks, moves] = await Promise.all([
        invokeIpc<StockItem[]>('get-stock', {
          storeId: currentStore?.id,
          q: search
        }),
        invokeIpc<any[]>('get-stock-movements', {
          storeId: currentStore?.id,
          movementCode: selectedMovementFilter ? Number(selectedMovementFilter) : undefined
        })
      ]);
      setStockList(stocks || []);
      setMovementsHistory(moves || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, [search, currentStore, selectedMovementFilter]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    try {
      await invokeIpc('adjust-stock', {
        productId: adjustItem.productId,
        storeId: adjustItem.storeId,
        newQuantity: parseInt(adjustNewQty, 10) || 0,
        note: adjustNote || 'Ajustement manuel inventaire',
        userId: currentUser?.id || 1
      });

      alert(isAr ? 'تم تعديل المخزون بنجاح (الرمز 93)!' : 'Stock ajusté avec succès (Code 93) !');
      setShowAdjustModal(false);
      loadStock();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferItem) return;
    try {
      await invokeIpc('transfer-stock', {
        fromStoreId: transferItem.storeId,
        toStoreId,
        productId: transferItem.productId,
        qty: parseInt(transferQty, 10) || 1,
        userId: currentUser?.id || 1,
        note: transferNote
      });

      alert(isAr ? 'تم التحويل بين المتاجر بنجاح (الرمزان 94 و 95)!' : 'Transfert inter-boutique exécuté avec succès (Codes 94 & 95) !');
      setShowTransferModal(false);
      loadStock();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const getMovementBadge = (code: number | null) => {
    switch (code) {
      case 90:
        return <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md font-bold uppercase">{isAr ? 'شراء 90' : 'Achat 90'}</span>;
      case 91:
        return <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-md font-bold uppercase">{isAr ? 'بيع 91' : 'Vente 91'}</span>;
      case 92:
        return <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md font-bold uppercase">{isAr ? 'إرجاع 92' : 'Retour 92'}</span>;
      case 93:
        return <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-md font-bold uppercase">{isAr ? 'تعديل 93' : 'Ajustement 93'}</span>;
      case 94:
        return <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-md font-bold uppercase">{isAr ? 'تحويل صادر 94' : 'Transf. Sortant 94'}</span>;
      case 95:
        return <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md font-bold uppercase">{isAr ? 'تحويل وارد 95' : 'Transf. Entrant 95'}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto bg-slate-950 text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-white tracking-tight">
              {isAr ? 'إدارة المخزون وتتبع الحركات' : 'Gestion des Stocks & Mouvements'}
            </h1>
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" /> {isAr ? 'تتبع شامل لجميع العمليات' : 'Traçabilité Tous Mouvements'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isAr 
              ? 'يتم عرض الكمية السابقة والحالية لجميع العمليات: شراء (90)، بيع (91)، إرجاع (92)، تعديل (93)، تحويل (94/95)' 
              : 'Affichage systématique de l\'ancien stock et du nouveau stock pour tout mouvement (Achat 90, Vente 91, Retour 92, Ajustement 93, Transfert 94/95).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub-tab switcher */}
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
            <button
              onClick={() => setActiveView('table')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeView === 'table' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'المخزون الحالي' : 'Stock par Article'}
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'history' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل الحركات الكامل' : 'Historique Audit'}</span>
            </button>
          </div>

          <button
            onClick={loadStock}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث برقم القطعة، الاسم، الماركة...' : 'Rechercher une pièce par référence ART-XXXXX, nom, marque...'}
            className="w-full text-xs font-medium outline-none bg-transparent text-slate-100 placeholder-slate-500"
          />
        </div>

        {activeView === 'history' && (
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedMovementFilter}
              onChange={e => setSelectedMovementFilter(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1 font-semibold outline-none"
            >
              <option value="">{isAr ? 'جميع العمليات' : 'Tous les Mouvements'}</option>
              <option value={90}>{isAr ? 'مشتريات (رمز 90)' : 'Achats (Code 90)'}</option>
              <option value={91}>{isAr ? 'مبيعات (رمز 91)' : 'Ventes (Code 91)'}</option>
              <option value={92}>{isAr ? 'إرجاعات (رمز 92)' : 'Retours (Code 92)'}</option>
              <option value={93}>{isAr ? 'تعديلات جرد (رمز 93)' : 'Ajustements Inventaire (Code 93)'}</option>
              <option value={94}>{isAr ? 'تحويلات بين المتاجر (94/95)' : 'Transferts Inter-Boutiques (94/95)'}</option>
            </select>
          </div>
        )}
      </div>

      {/* VIEW 1: Stock Articles Table */}
      {activeView === 'table' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-bold uppercase border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">{isAr ? 'الرمز' : 'Code'}</th>
                  <th className="px-4 py-3">{isAr ? 'تعيين القطعة' : 'Désignation'}</th>
                  <th className="px-4 py-3">{isAr ? 'المحل' : 'Boutique'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الكمية (التتبع البصري السابق والحالي)' : 'Quantité (Audit Visuel Ancien &rarr; Nouveau)'}</th>
                  <th className="px-4 py-3 text-right">{isAr ? 'سعر الشراء' : 'Prix Achat'}</th>
                  <th className="px-4 py-3 text-right">{isAr ? 'سعر البيع' : 'Prix Détail'}</th>
                  <th className="px-4 py-3 text-right">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stockList.map(s => (
                  <tr key={`${s.productId}-${s.storeId}`} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-blue-400">{s.productCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{s.productName}</div>
                      <div className="text-[10px] text-slate-500">{s.brandName} • {s.categoryName}</div>
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-300">{s.storeName}</td>

                    {/* KEY CLIENT REQUIREMENT: Highlight with old in RED and new in GREEN with exact process badge */}
                    <td className="px-4 py-3 text-center">
                      {s.hasRecentMovement && s.recentQtyBefore !== null ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-950/80 border border-slate-700 rounded-xl">
                          <span className="font-mono text-rose-400 font-bold line-through text-xs" title="Quantité précédente">
                            {s.recentQtyBefore}
                          </span>
                          <span className="text-emerald-400 font-black">&rarr;</span>
                          <span className="font-mono text-emerald-300 font-black text-sm" title="Quantité actuelle">
                            {s.quantity}
                          </span>
                          {getMovementBadge(s.lastMovementCode)}
                        </div>
                      ) : (
                        <span className={`inline-block px-3 py-1 rounded-xl font-bold font-mono text-xs ${
                          s.quantity <= 5 ? 'bg-rose-950/40 text-rose-300 border border-rose-800/50' : 'bg-slate-800 text-slate-200'
                        }`}>
                          {s.quantity}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-slate-400">{formatDZD(s.priceAchat)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatDZD(s.priceDetail)}</td>

                    {/* Actions: Adjust (93) & Transfer (94/95) */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {hasPermission('stock', 'edit') && (
                          <>
                            <button
                              onClick={() => {
                                setTransferItem(s);
                                setToStoreId(s.storeId === 1 ? 2 : 1);
                                setTransferQty('1');
                                setTransferNote('');
                                setShowTransferModal(true);
                              }}
                              title="Transférer vers l'autre boutique (94/95)"
                              className="p-1.5 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-xs font-semibold flex items-center gap-1"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">{isAr ? 'تحويل' : 'Transfert'}</span>
                            </button>

                            <button
                              onClick={() => {
                                setAdjustItem(s);
                                setAdjustNewQty(s.quantity.toString());
                                setAdjustNote('');
                                setShowAdjustModal(true);
                              }}
                              title="Ajustement manuel de stock (93)"
                              className="p-1.5 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-xs font-semibold flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">{isAr ? 'تعديل' : 'Ajuster'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Complete Audit History Table */}
      {activeView === 'history' && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden space-y-2">
          <div className="p-3 bg-slate-800/80 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-300">
            <span>{isAr ? 'سجل تتبع العمليات والمخزون' : 'Journal Complet de Traçabilité des Mouvements'} ({movementsHistory.length})</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 font-bold uppercase border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">{isAr ? 'التاريخ والوقت' : 'Date & Heure'}</th>
                  <th className="px-4 py-3">{isAr ? 'القطعة' : 'Pièce'}</th>
                  <th className="px-4 py-3">{isAr ? 'المحل' : 'Boutique'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'نوع الحركة' : 'Type de Mouvement'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'السابق' : 'Ancien'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'التغير' : 'Variation'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الجديد' : 'Nouveau'}</th>
                  <th className="px-4 py-3">{isAr ? 'المستخدم' : 'Opérateur'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {movementsHistory.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono">
                      {new Date(m.created_at || m.createdAt).toLocaleString('fr-DZ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{m.productName}</div>
                      <div className="text-[10px] text-blue-400 font-mono">{m.productCode}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-300">{m.storeName}</td>
                    <td className="px-4 py-3 text-center">
                      {getMovementBadge(m.movement_code || m.movementCode)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-rose-400 font-bold line-through">
                      {m.qty_before ?? m.qtyBefore}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black">
                      {(m.delta || 0) > 0 ? (
                        <span className="text-emerald-400">+{m.delta}</span>
                      ) : (
                        <span className="text-rose-400">{m.delta}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-emerald-300 font-black">
                      {m.qty_after ?? m.qtyAfter}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{m.userName || 'Admin'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Inter-Store Transfer (94 & 95) */}
      {showTransferModal && transferItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-400" />
                <span>{isAr ? 'تحويل بين المتاجر (94 / 95)' : 'Transfert Inter-Boutique (94 / 95)'}</span>
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-2xl text-xs space-y-1 border border-slate-700">
              <div className="font-bold text-white">{transferItem.productName}</div>
              <div className="text-slate-400">
                {isAr ? 'الرمز :' : 'Réf :'} {transferItem.productCode} • {isAr ? 'المتاح في المحل المصدر :' : 'Dispo source :'} <b className="text-emerald-400">{transferItem.quantity} {isAr ? 'وحدة' : 'unités'}</b>
              </div>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'المحل الوجهة' : 'Boutique Destination'}</label>
                <select
                  value={toStoreId}
                  onChange={e => setToStoreId(parseInt(e.target.value, 10))}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  <option value={1}>Boutique 1 (Centre-Ville)</option>
                  <option value={2}>Boutique 2 (Zone Industrielle / Dépôt)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'الكمية المحولة' : 'Quantité à Transférer'}</label>
                <input
                  type="number"
                  min="1"
                  max={transferItem.quantity}
                  required
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-black text-center text-blue-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'ملاحظة التحويل' : 'Motif / Note de transfert'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: تعزيز عاجل للمحل 2' : 'Ex: Réassort urgent boutique 2'}
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  {isAr ? 'تأكيد التحويل' : 'Confirmer le Transfert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Stock Adjustment (Code 93) */}
      {showAdjustModal && adjustItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <span>{isAr ? 'تعديل يدوي للمخزون (رمز 93)' : 'Ajustement Manuel de Stock (Code 93)'}</span>
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-2xl text-xs space-y-1 border border-slate-700">
              <div className="font-bold text-white">{adjustItem.productName}</div>
              <div className="text-slate-400">
                {isAr ? 'المخزون المسجل حالياً :' : 'Stock actuel enregistré :'} <b className="text-amber-400">{adjustItem.quantity} {isAr ? 'وحدة' : 'unités'}</b>
              </div>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'الكمية الفعلية المحصية' : 'Nouvelle Quantité Réelle Comptée'}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustNewQty}
                  onChange={e => setAdjustNewQty(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-black text-center text-purple-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'سبب التعديل' : 'Motif de la correction'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: جرد فعلي دوري' : 'Ex: Inventaire physique périodique'}
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  {isAr ? 'حفظ التعديل (رمز 93)' : 'Enregistrer l\'Ajustement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
