import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Supplier } from '@gestion-veloo/shared';
import { formatDZD } from '@gestion-veloo/shared';
import { Building2, Plus, Search, DollarSign, X, History, Phone, MapPin } from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const { hasPermission, lang } = useStore();
  const isAr = lang === 'ar';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // New Supplier Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Versement Modal
  const [showVersementModal, setShowVersementModal] = useState(false);
  const [versementAmount, setVersementAmount] = useState('');
  const [versementNote, setVersementNote] = useState('');

  const loadSuppliers = async () => {
    try {
      const res = await invokeIpc<Supplier[]>('get-suppliers');
      setSuppliers(res || []);
      if (selectedSupplier) {
        const updated = res?.find(s => s.id === selectedSupplier.id);
        if (updated) setSelectedSupplier(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleSelectSupplier = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    try {
      const txs = await invokeIpc<any[]>('get-supplier-transactions', supp.id);
      setTransactions(txs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invokeIpc('create-supplier', { name, phone, address });
      alert(isAr ? 'تمت إضافة المورد بنجاح!' : 'Fournisseur créé avec succès !');
      setShowAddModal(false);
      setName('');
      setPhone('');
      setAddress('');
      loadSuppliers();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleSaveVersement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    try {
      const amountCentimes = Math.round((parseFloat(versementAmount) || 0) * 100);
      await invokeIpc('create-supplier-versement', {
        supplierId: selectedSupplier.id,
        amount: amountCentimes,
        note: versementNote || 'Règlement facture'
      });

      alert(isAr ? 'تم تسجيل تسديد المورد بنجاح!' : 'Règlement fournisseur enregistré !');
      setShowVersementModal(false);
      setVersementAmount('');
      setVersementNote('');
      loadSuppliers();
      handleSelectSupplier(selectedSupplier);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.phone && s.phone.includes(search))
  );

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <span>{isAr ? 'إدارة الموردين والديون المستحقة' : 'Gestion des Fournisseurs & Dettes'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'متابعة حسابات الموردين، فواتير الشراء، وتسديد المستحقات' : 'Suivi des arrivages, soldes fournisseurs et enregistrement des règlements.'}
          </p>
        </div>

        {hasPermission('fournisseurs', 'edit') && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'مورد جديد' : 'Nouveau Fournisseur'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Suppliers List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث باسم المورد أو رقم الهاتف...' : 'Rechercher par nom de fournisseur, téléphone...'}
              className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder-slate-500"
            />
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 uppercase font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">{isAr ? 'المورد' : 'Fournisseur'}</th>
                  <th className="px-4 py-3">{isAr ? 'الهاتف' : 'Téléphone'}</th>
                  <th className="px-4 py-3">{isAr ? 'العنوان' : 'Adresse'}</th>
                  <th className="px-4 py-3 text-right">{isAr ? 'مستحقات المورد (دينه علينا)' : 'Dette Restante'}</th>
                  <th className="px-4 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredSuppliers.map(s => {
                  const isSelected = selectedSupplier?.id === s.id;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => handleSelectSupplier(s)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-white">{s.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{s.phone || '-'}</td>
                      <td className="px-4 py-3 text-slate-400">{s.address || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        {(s.currentDebt || 0) > 0 ? (
                          <span className="text-rose-400 font-bold">{formatDZD(s.currentDebt || 0)}</span>
                        ) : (
                          <span className="text-emerald-400">{formatDZD(0)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectSupplier(s);
                            setShowVersementModal(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-bold"
                        >
                          + {isAr ? 'تسديد' : 'Régler'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Selected Supplier Details & Transaction History */}
        <div className="space-y-4">
          {selectedSupplier ? (
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-white text-base">{selectedSupplier.name}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span>{selectedSupplier.phone || 'Non renseigné'}</span>
                  </p>
                </div>

                <button
                  onClick={() => setShowVersementModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20"
                >
                  + {isAr ? 'تسديد' : 'Régler'}
                </button>
              </div>

              {/* Debt Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 font-semibold">{isAr ? 'مستحقات المورد المتبقية' : 'Solde Dû au Fournisseur'}</span>
                <div className={`text-xl font-black font-mono mt-1 ${
                  (selectedSupplier.currentDebt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {formatDZD(selectedSupplier.currentDebt || 0)}
                </div>
              </div>

              {/* Transaction History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سجل الفواتير والتسديدات' : 'Historique des Achats & Règlements'}</span>
                </h4>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl p-2 bg-slate-950 text-xs">
                  {transactions.map(tx => (
                    <div key={tx.id} className="py-2 px-1 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {tx.type === 'achat' ? (isAr ? 'سند شراء (فاتورة)' : 'Arrivage Achat') : (isAr ? 'تسديد دفعة' : 'Règlement')}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(tx.created_at || tx.createdAt).toLocaleDateString('fr-DZ')} {tx.note && `• ${tx.note}`}
                        </div>
                      </div>
                      <span className={`font-mono font-bold ${
                        tx.type === 'achat' ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {tx.type === 'achat' ? `+${formatDZD(tx.amount)}` : `-${formatDZD(tx.amount)}`}
                      </span>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <p className="text-xs text-slate-500 italic text-center py-4">{isAr ? 'لا توجد حركات مسجلة' : 'Aucune opération enregistrée'}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center text-slate-500 text-xs font-medium">
              {isAr ? 'اختر مورداً لعرض حسابه' : 'Sélectionnez un fournisseur pour voir le détail de ses factures et versements.'}
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Supplier */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <span>{isAr ? 'إضافة مورد جديد' : 'Nouveau Fournisseur'}</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'اسم المورد / الشركة *' : 'Raison Sociale / Nom *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: شركة سارل لقطع الغيار' : 'Ex: SARL Moto Pièces Import'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'رقم الهاتف' : 'Téléphone'}</label>
                <input
                  type="text"
                  placeholder="021 00 00 00"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'العنوان' : 'Adresse'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'المنطقة الصناعية واد السمار' : 'Zone Industrielle Oued Smar'}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30"
                >
                  {isAr ? 'حفظ المورد' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Versement */}
      {showVersementModal && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'تسجيل تسديد للمورد' : 'Règlement Fournisseur'}</span>
              </h3>
              <button onClick={() => setShowVersementModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">{isAr ? 'المورد :' : 'Fournisseur :'} </span>
              <span className="font-bold text-white">{selectedSupplier.name}</span> • 
              <span className="text-slate-400"> {isAr ? 'المستحقات المتبقية :' : 'Solde dû :'} </span>
              <span className="font-mono font-bold text-rose-400">{formatDZD(selectedSupplier.currentDebt || 0)}</span>
            </div>

            <form onSubmit={handleSaveVersement} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'المبلغ المسدد (دج) *' : 'Montant Réglé (DA) *'}</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="0.00"
                  value={versementAmount}
                  onChange={e => setVersementAmount(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-black text-center text-emerald-400 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'ملاحظة' : 'Note / Référence chèque / virement'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: تسديد نقدي للدفعة' : 'Ex: Règlement chèque #1234'}
                  value={versementNote}
                  onChange={e => setVersementNote(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowVersementModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/30"
                >
                  {isAr ? 'تأكيد التسديد' : 'Valider le Règlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
