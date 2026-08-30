import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Client } from '@gestion-veloo/shared';
import { formatDZD } from '@gestion-veloo/shared';
import { Users, UserPlus, Search, UserCheck, DollarSign, CreditCard, History, X, Plus, Phone, MapPin } from 'lucide-react';

export const ClientsPage: React.FC = () => {
  const { hasPermission, lang } = useStore();
  const isAr = lang === 'ar';

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // New Client Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isFidele, setIsFidele] = useState(false);

  // Versement Modal
  const [showVersementModal, setShowVersementModal] = useState(false);
  const [versementAmount, setVersementAmount] = useState('');
  const [versementNote, setVersementNote] = useState('');

  const loadClients = async () => {
    try {
      const res = await invokeIpc<Client[]>('get-clients');
      setClients(res || []);
      if (selectedClient) {
        const updated = res?.find(c => c.id === selectedClient.id);
        if (updated) setSelectedClient(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleSelectClient = async (client: Client) => {
    setSelectedClient(client);
    try {
      const txs = await invokeIpc<any[]>('get-client-transactions', client.id);
      setTransactions(txs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invokeIpc('create-client', { name, phone, address, isFidele });
      alert(isAr ? 'تمت إضافة الزبون بنجاح!' : 'Client créé avec succès !');
      setShowAddModal(false);
      setName('');
      setPhone('');
      setAddress('');
      setIsFidele(false);
      loadClients();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleSaveVersement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    const amountCentimes = Math.round((parseFloat(versementAmount) || 0) * 100);
    if (amountCentimes <= 0) return;

    try {
      await invokeIpc('create-client-versement', {
        clientId: selectedClient.id,
        amount: amountCentimes,
        note: versementNote || 'Règlement dette'
      });

      alert(isAr ? 'تم تسجيل الدفعة بنجاح!' : 'Versement enregistré avec succès !');
      setShowVersementModal(false);
      setVersementAmount('');
      setVersementNote('');
      loadClients();
      handleSelectClient(selectedClient);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search))
  );

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>{isAr ? 'إدارة الزبائن والديون (Crédits)' : 'Gestion des Clients & Crédits'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'متابعة حسابات الزبائن، ديون البيع بالآجل، وتسجيل الدفعات' : 'Comptes clients, statut Client Fidèle, suivi des arriérés et versements.'}
          </p>
        </div>

        {hasPermission('clients', 'edit') && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isAr ? 'زبون جديد' : 'Nouveau Client'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Clients List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث باسم الزبون أو رقم الهاتف...' : 'Rechercher par nom, téléphone...'}
              className="w-full bg-transparent text-xs font-medium text-white outline-none placeholder-slate-500"
            />
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 uppercase font-bold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">{isAr ? 'الزبون' : 'Client'}</th>
                  <th className="px-4 py-3">{isAr ? 'الهاتف' : 'Téléphone'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الحالة' : 'Statut'}</th>
                  <th className="px-4 py-3 text-right">{isAr ? 'الدين الحالي' : 'Dette Actuelle'}</th>
                  <th className="px-4 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredClients.map(c => {
                  const isSelected = selectedClient?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{c.name}</span>
                          {c.isFidele && <span title="Client Fidèle">⭐</span>}
                        </div>
                        {c.address && <div className="text-[10px] text-slate-400">{c.address}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">{c.phone || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {c.isFidele ? (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold rounded-md">
                            {isAr ? 'زبون وفي' : 'Fidèle'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-semibold rounded-md">
                            {isAr ? 'عادي' : 'Standard'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        {(c.currentDebt || 0) > 0 ? (
                          <span className="text-rose-400 font-bold">{formatDZD(c.currentDebt || 0)}</span>
                        ) : (
                          <span className="text-emerald-400">{formatDZD(0)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectClient(c);
                            setShowVersementModal(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-bold"
                        >
                          + {isAr ? 'دفعة' : 'Versement'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Selected Client Details & Transaction History */}
        <div className="space-y-4">
          {selectedClient ? (
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-1.5">
                    <span>{selectedClient.name}</span>
                    {selectedClient.isFidele && <span>⭐</span>}
                  </h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span>{selectedClient.phone || 'Non renseigné'}</span>
                  </p>
                </div>

                <button
                  onClick={() => setShowVersementModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20"
                >
                  + {isAr ? 'تسجيل دفعة' : 'Versement'}
                </button>
              </div>

              {/* Debt Card */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center">
                <span className="text-xs text-slate-400 font-semibold">{isAr ? 'إجمالي الدين المستحق' : 'Solde Débiteur Actuel'}</span>
                <div className={`text-xl font-black font-mono mt-1 ${
                  (selectedClient.currentDebt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {formatDZD(selectedClient.currentDebt || 0)}
                </div>
              </div>

              {/* Transaction History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سجل العمليات والمدفوعات' : 'Historique des Opérations'}</span>
                </h4>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl p-2 bg-slate-950 text-xs">
                  {transactions.map(tx => (
                    <div key={tx.id} className="py-2 px-1 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {tx.type === 'achat' ? (isAr ? 'شراء بالآجل' : 'Achat à Crédit') : (isAr ? 'دفعة مسددة' : 'Versement')}
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
              {isAr ? 'اختر زبوناً من القائمة لعرض تفاصيل حسابه' : 'Sélectionnez un client dans la liste pour afficher ses détails et son historique de paiement.'}
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Client */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <span>{isAr ? 'إضافة زبون جديد' : 'Nouveau Client'}</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'اسم الزبون *' : 'Nom Complet du Client *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: أحمد بلقاسم' : 'Ex: Ahmed Belkacem'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'رقم الهاتف' : 'Numéro de Téléphone'}</label>
                <input
                  type="text"
                  placeholder="0550 00 00 00"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'العنوان' : 'Adresse / Ville'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'الجزائر العاصمة' : 'Alger'}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isFidele}
                  onChange={e => setIsFidele(e.target.checked)}
                />
                <span>{isAr ? 'تعيين كزبون وفي (Client Fidèle ⭐)' : 'Marquer comme Client Fidèle (⭐)'}</span>
              </label>

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
                  {isAr ? 'حفظ الزبون' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Versement */}
      {showVersementModal && selectedClient && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'تسجيل دفعة زبون' : 'Enregistrer un Versement Client'}</span>
              </h3>
              <button onClick={() => setShowVersementModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">{isAr ? 'الزبون :' : 'Client :'} </span>
              <span className="font-bold text-white">{selectedClient.name}</span> • 
              <span className="text-slate-400"> {isAr ? 'الدين الحالي :' : 'Dette actuelle :'} </span>
              <span className="font-mono font-bold text-rose-400">{formatDZD(selectedClient.currentDebt || 0)}</span>
            </div>

            <form onSubmit={handleSaveVersement} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'مبلغ الدفعة (دج) *' : 'Montant Versé (DA) *'}</label>
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
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'ملاحظة' : 'Note / Référence reçu'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: تسوية جزء من الدين' : 'Ex: Règlement partiel en espèces'}
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
                  {isAr ? 'تأكيد الدفعة' : 'Valider le Versement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
