import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { formatDZD } from '@gestion-veloo/shared';
import { 
  Truck, 
  Plus, 
  Trash2, 
  Building, 
  CheckCircle2, 
  Boxes, 
  AlertCircle,
  FileText,
  DollarSign,
  History,
  Calendar,
  Layers,
  Search,
  X
} from 'lucide-react';

interface PurchaseItemInput {
  productId: number;
  productName: string;
  productCode: string;
  qty: number;
  unitCost: number; // centimes
  useAvgPrice?: boolean; // toggle prix moyen pour ce produit
}

export const PurchasesPage: React.FC = () => {
  const { currentStore, currentUser, lang, theme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchasesHistory, setPurchasesHistory] = useState<any[]>([]);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit' | 'mixed'>('cash');
  const [amountPaidDZD, setAmountPaidDZD] = useState<string>('');
  const [items, setItems] = useState<PurchaseItemInput[]>([]);

  // Item Selector State
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [itemQty, setItemQty] = useState<string>('1');
  const [itemCostDZD, setItemCostDZD] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const loadData = async () => {
    try {
      const [supps, prods, history] = await Promise.all([
        invokeIpc<any[]>('get-suppliers'),
        invokeIpc<any[]>('get-products', { storeId: currentStore?.id }),
        invokeIpc<any[]>('get-purchases', { storeId: currentStore?.id })
      ]);
      setSuppliers(supps || []);
      setProducts(prods || []);
      setPurchasesHistory(history || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentStore]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (prod: any) => {
    setSelectedProduct(prod);
    setProductSearchQuery(`${prod.code} - ${prod.name}`);
    setItemCostDZD(((prod.priceAchat || 0) / 100).toString());
    setIsDropdownOpen(false);
  };

  const handleClearSelectedProduct = () => {
    setSelectedProduct(null);
    setProductSearchQuery('');
    setItemCostDZD('');
    setItemQty('1');
    setIsDropdownOpen(false);
  };

  const filteredProducts = products.filter(p => {
    if (!productSearchQuery.trim()) return true;
    const q = productSearchQuery.toLowerCase().trim();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      (p.brandName && p.brandName.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.barcodes && p.barcodes.some((b: any) => b.barcodeValue?.toLowerCase().includes(q)))
    );
  }).slice(0, 40);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseInt(itemQty, 10) || 1;
    const unitCost = Math.round((parseFloat(itemCostDZD) || 0) * 100);

    const existingIndex = items.findIndex(it => it.productId === selectedProduct.id);
    if (existingIndex > -1) {
      const updated = [...items];
      updated[existingIndex].qty += qty;
      updated[existingIndex].unitCost = unitCost;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productCode: selectedProduct.code,
          qty,
          unitCost,
          useAvgPrice: true // default: use avg price
        }
      ]);
    }

    handleClearSelectedProduct();
  };

  const toggleAvgPrice = (idx: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], useAvgPrice: !updated[idx].useAvgPrice };
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const subtotalCentimes = items.reduce((sum, it) => sum + (it.qty * it.unitCost), 0);
  const totalDZD = subtotalCentimes / 100;

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || items.length === 0) return;

    const paidCentimes = paymentType === 'credit' 
      ? 0 
      : (paymentType === 'mixed' ? Math.round((parseFloat(amountPaidDZD) || 0) * 100) : subtotalCentimes);

    setLoading(true);
    try {
      await invokeIpc('create-purchase', {
        storeId: currentStore?.id || 1,
        supplierId: selectedSupplierId,
        userId: currentUser?.id || 1,
        paymentType,
        amountPaid: paidCentimes,
        items
      });

      alert(isAr 
        ? 'تم تسجيل سند الشراء بنجاح وتحديث المخزون (رمز 90)!' 
        : 'Bon d\'achat enregistré avec succès et stock réassorti (Code 90) !'
      );
      setItems([]);
      setSelectedSupplierId('');
      setAmountPaidDZD('');
      setPaymentType('cash');
      loadData();
      setActiveTab('history');
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = purchasesHistory.filter(p => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      p.supplierName?.toLowerCase().includes(q) ||
      p.id?.toString().includes(q) ||
      p.items?.some((it: any) => it.productName?.toLowerCase().includes(q) || it.productCode?.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`p-6 space-y-6 h-full overflow-y-auto ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Header with Tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {isAr ? 'سندات الشراء وإدارة التوريدات' : 'Bons d\'Achat & Réassorts Fournisseurs'}
            </h1>
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-bold rounded-full border border-emerald-500/30">
              {isAr ? 'الرمز 90 مفعل' : 'Code 90 Réassort'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isAr
              ? 'تسجيل وصول السلع من الموردين وتتبع تفاصيل كل فاتورة شراء مع أسعارها وكمياتها'
              : 'Enregistrez les arrivages fournisseurs et consultez en détail chaque article acheté.'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
              activeTab === 'new' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'سند شراء جديد' : 'Nouveau Bon d\'Achat'}</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
              activeTab === 'history' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>{isAr ? 'سجل المشتريات والتفاصيل' : 'Historique des Achats'} ({purchasesHistory.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: NEW PURCHASE FORM */}
      {activeTab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Product Selection & Lines */}
          <div className="lg:col-span-2 space-y-4">
            {/* Add Item Card */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-400" />
                <span>{isAr ? 'اختيار القطعة المراد إضافتها للسند' : 'Sélectionner une pièce à ajouter'}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Searchable Product Autocomplete */}
                <div className="md:col-span-3 relative" ref={dropdownRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300">
                      {isAr ? 'القطعة / المرجع (ابحث بالاسم، الكود، أو الباركود)' : 'Pièce / Référence (Recherche par désignation, code article, code-barres...)'}
                    </label>
                    {selectedProduct && (
                      <button
                        type="button"
                        onClick={handleClearSelectedProduct}
                        className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold"
                      >
                        <X className="w-3 h-3" />
                        {isAr ? 'إلغاء التحديد' : 'Désélectionner'}
                      </button>
                    )}
                  </div>

                  <div className="relative mt-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={productSearchQuery}
                      onChange={e => {
                        setProductSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredProducts.length > 0) {
                            handleSelectProduct(filteredProducts[0]);
                          }
                        } else if (e.key === 'Escape') {
                          setIsDropdownOpen(false);
                        }
                      }}
                      placeholder={isAr ? 'ابحث عن قطعة بالاسم أو الرمز (مثال: BOUGIE, HUILE, FLT...)' : 'Rechercher une pièce par nom, code article, ou code-barres...'}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl pl-9 pr-9 py-2 text-xs font-bold text-white outline-none transition-all placeholder-slate-500"
                    />
                    {productSearchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSelectedProduct}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Suggestions Dropdown */}
                  {isDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800">
                      {filteredProducts.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 font-medium">
                          {isAr ? 'لا توجد قطع مطابقة للبحث' : 'Aucune pièce trouvée pour cette recherche'}
                        </div>
                      ) : (
                        filteredProducts.map(p => {
                          const isSelected = selectedProduct?.id === p.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => handleSelectProduct(p)}
                              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-600/30 text-blue-200' : 'hover:bg-slate-800 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 font-mono text-[10px] font-bold text-blue-400">
                                  {p.code}
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-white">{p.name}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {p.brandName || 'Générique'} {p.location ? `• Emplacement: ${p.location}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[11px] font-bold text-emerald-400">
                                  {formatDZD(p.priceAchat || 0)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Stock: {p.totalStock ?? p.stock?.reduce((acc: number, s: any) => acc + (s.quantity || 0), 0) ?? 0}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Selected Product Info Badge */}
                  {selectedProduct && (
                    <div className="mt-2 p-2 rounded-xl bg-blue-950/40 border border-blue-800/40 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white">{selectedProduct.code} - {selectedProduct.name}</span>
                        {selectedProduct.brandName && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">{selectedProduct.brandName}</span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        P. Achat catalogue: {formatDZD(selectedProduct.priceAchat || 0)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'الكمية المشتراة' : 'Quantité Achetée'}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={itemQty}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setItemQty(val);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem(e);
                      }
                    }}
                    placeholder="1"
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-center text-emerald-400 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'سعر الشراء الفردي (دج)' : 'Prix d\'Achat Unitaire (DA)'}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={itemCostDZD}
                    onChange={e => {
                      const val = e.target.value.replace(',', '.');
                      if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                        setItemCostDZD(val);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem(e);
                      }
                    }}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-center text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedProduct}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isAr ? 'إضافة للسند' : 'Ajouter au Bon'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Purchase Line Items Table */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-800/80 border-b border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>{isAr ? 'محتويات سند الشراء' : 'Lignes du Bon d\'Achat'} ({items.length})</span>
                <span className="font-mono text-emerald-400 font-bold">{formatDZD(subtotalCentimes)}</span>
              </div>

              {items.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-medium">
                  {isAr ? 'لم تتم إضافة أي قطع بعد' : 'Aucun article ajouté au bon d\'achat pour le moment.'}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/40 text-slate-400 uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">{isAr ? 'الرمز' : 'Réf'}</th>
                      <th className="px-4 py-2.5">{isAr ? 'تعيين القطعة' : 'Désignation'}</th>
                      <th className="px-4 py-2.5 text-center">{isAr ? 'الكمية' : 'Qté'}</th>
                      <th className="px-4 py-2.5 text-right">{isAr ? 'سعر الشراء' : 'Prix Unitaire'}</th>
                      <th className="px-4 py-2.5 text-right">{isAr ? 'المجموع' : 'Total Ligne'}</th>
                      <th className="px-4 py-2.5 text-center" title="Activer le calcul de Prix Moyen pour ce produit">
                        <span className="text-[10px] text-blue-400">⌀ Moy.</span>
                      </th>
                      <th className="px-4 py-2.5 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono font-bold text-blue-400">{it.productCode}</td>
                        <td className="px-4 py-3 font-bold text-white">{it.productName}</td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-emerald-400">+{it.qty}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">{formatDZD(it.unitCost)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{formatDZD(it.qty * it.unitCost)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleAvgPrice(idx)}
                            title={it.useAvgPrice ? 'Prix Moyen activé — cliquer pour désactiver' : 'Prix Moyen désactivé — cliquer pour activer'}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                              it.useAvgPrice
                                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30'
                                : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {it.useAvgPrice ? '⌀ ON' : '⌀ OFF'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column: Supplier & Payment Summary */}
          <div className="space-y-4">
            <form onSubmit={handleSubmitPurchase} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? 'بيانات المورد والدفع' : 'Fournisseur & Modalités'}</span>
              </h3>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'المورد *' : 'Fournisseur *'}</label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(parseInt(e.target.value, 10))}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  <option value="">{isAr ? '-- اختر المورد --' : '-- Sélectionner le fournisseur --'}</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone || 'Sans tel'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'طريقة الدفع' : 'Mode de Règlement'}</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[
                    { id: 'cash', label: isAr ? 'نقداً' : 'Comptant' },
                    { id: 'credit', label: isAr ? 'آجل' : 'Crédit' },
                    { id: 'mixed', label: isAr ? 'دفعة جزئية' : 'Mixte' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentType(m.id as any)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        paymentType === m.id
                          ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentType === 'mixed' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'المبلغ المدفوع فوراً (دج)' : 'Montant Versé Comptant (DA)'}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    value={amountPaidDZD}
                    onChange={e => {
                      const val = e.target.value.replace(',', '.');
                      if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                        setAmountPaidDZD(val);
                      }
                    }}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-emerald-400 outline-none text-center focus:border-blue-500"
                  />
                </div>
              )}

              {/* Summary calculations */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>{isAr ? 'إجمالي السند :' : 'Total Facture Achat :'}</span>
                  <span className="font-mono font-bold text-white">{formatDZD(subtotalCentimes)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{isAr ? 'المدفوع :' : 'Montant Réglé :'}</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {paymentType === 'credit' 
                      ? formatDZD(0) 
                      : (paymentType === 'mixed' ? formatDZD(Math.round((parseFloat(amountPaidDZD) || 0) * 100)) : formatDZD(subtotalCentimes))}
                  </span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-800 pt-2 text-rose-400">
                  <span>{isAr ? 'الرصيد المتبقي (دين) :' : 'Dette Générée :'}</span>
                  <span className="font-mono">
                    {paymentType === 'credit'
                      ? formatDZD(subtotalCentimes)
                      : (paymentType === 'mixed' ? formatDZD(Math.max(0, subtotalCentimes - Math.round((parseFloat(amountPaidDZD) || 0) * 100))) : formatDZD(0))}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || items.length === 0 || !selectedSupplierId}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{loading ? (isAr ? 'جاري التسجيل...' : 'Enregistrement...') : (isAr ? 'تأكيد السند وتحديث المخزون (90)' : 'Valider l\'Arrivage & Stocker (Code 90)')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: DETAILED PURCHASES HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder={isAr ? 'ابحث في السندات باسم المورد، رقم السند، اسم القطعة...' : 'Rechercher par fournisseur, N° de bon, pièce...'}
              className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder-slate-500"
            />
          </div>

          <div className="space-y-4">
            {filteredHistory.map(pur => (
              <div key={pur.id} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
                {/* Header of Purchase Bill */}
                <div className="p-4 bg-slate-800/80 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/30">
                      BON ACHAT #{pur.id}
                    </span>
                    <span className="font-bold text-white text-sm">{pur.supplierName}</span>
                    <span className="text-slate-400">({pur.supplierPhone || 'Sans tél'})</span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-300">
                    <div className="flex items-center gap-1.5 font-mono text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(pur.created_at || pur.createdAt).toLocaleString('fr-DZ')}</span>
                    </div>

                    <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg font-bold uppercase text-[11px]">
                      {pur.payment_type || pur.paymentType}
                    </span>
                  </div>
                </div>

                {/* Items in this Purchase Bill */}
                <div className="p-4 space-y-3">
                  <div className="text-[11px] font-bold uppercase text-slate-400">
                    {isAr ? 'القطع المشتراة في هذا السند :' : 'Articles achetés dans ce bon :'}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 text-slate-400 font-bold border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2">{isAr ? 'الرمز' : 'Réf'}</th>
                          <th className="px-3 py-2">{isAr ? 'تعيين القطعة' : 'Désignation'}</th>
                          <th className="px-3 py-2 text-center">{isAr ? 'الكمية المستلمة' : 'Qté Reçue'}</th>
                          <th className="px-3 py-2 text-right">{isAr ? 'سعر الشراء' : 'Prix Unitaire'}</th>
                          <th className="px-3 py-2 text-right">{isAr ? 'المجموع' : 'Total'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {pur.items?.map((it: any) => (
                          <tr key={it.id} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2 font-mono font-bold text-blue-400">{it.productCode}</td>
                            <td className="px-3 py-2 font-semibold text-white">{it.productName}</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-emerald-400">+{it.qty}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">{formatDZD(it.unit_cost || it.unitCost)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{formatDZD(it.line_total || it.lineTotal || (it.qty * it.unit_cost))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Purchase Bill Totals Bar */}
                  <div className="flex flex-wrap items-center justify-end gap-6 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400">{isAr ? 'إجمالي الفاتورة :' : 'Total Facture :'} </span>
                      <span className="font-mono font-black text-white text-sm">{formatDZD(pur.total)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">{isAr ? 'المبلغ المسدد :' : 'Payé :'} </span>
                      <span className="font-mono font-bold text-emerald-400">{formatDZD(pur.amount_paid || pur.amountPaid || 0)}</span>
                    </div>
                    {pur.total - (pur.amount_paid || pur.amountPaid || 0) > 0 && (
                      <div>
                        <span className="text-slate-400">{isAr ? 'دليل الدين المتبقي :' : 'Reste Dû :'} </span>
                        <span className="font-mono font-bold text-rose-400">{formatDZD(pur.total - (pur.amount_paid || pur.amountPaid || 0))}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
