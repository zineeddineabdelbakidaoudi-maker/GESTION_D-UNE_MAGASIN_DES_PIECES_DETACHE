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

  const [showDossierModal, setShowDossierModal] = useState(false);
  const [clientSales, setClientSales] = useState<any[]>([]);
  const [dossierTab, setDossierTab] = useState<'all' | 'sales' | 'versements'>('all');

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

  const handleSelectClient = async (client: Client, openDossier = false) => {
    setSelectedClient(client);
    try {
      const [txs, allSales] = await Promise.all([
        invokeIpc<any[]>('get-client-transactions', client.id),
        invokeIpc<any[]>('get-sales', { storeId: 1, limit: 200 })
      ]);
      setTransactions(txs || []);
      const matchedSales = (allSales || []).filter((s: any) => s.clientId === client.id || s.client_id === client.id);
      setClientSales(matchedSales);
      if (openDossier) setShowDossierModal(true);
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
                      onClick={() => handleSelectClient(c, false)}
                      onDoubleClick={() => handleSelectClient(c, true)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''
                      }`}
                      title={isAr ? 'انقر مرتين لفتح الملف الكامل' : 'Double-cliquez pour ouvrir la fiche complète'}
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
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectClient(c, true);
                            }}
                            className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] font-bold"
                            title={isAr ? 'الملف الكامل' : 'Fiche Complète'}
                          >
                            {isAr ? 'الملف' : 'Fiche'}
                          </button>
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
                        </div>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDossierModal(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/20"
                  >
                    {isAr ? 'الملف الكامل' : 'Dossier'}
                  </button>
                  <button
                    onClick={() => setShowVersementModal(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20"
                  >
                    + {isAr ? 'دفعة' : 'Versement'}
                  </button>
                </div>
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
                  {transactions.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs">
                      {isAr ? 'لا توجد عمليات مسجلة' : 'Aucune opération enregistrée'}
                    </div>
                  ) : (
                    transactions.map((tx: any) => (
                      <div key={tx.id} className="p-2 flex items-center justify-between hover:bg-slate-900/50 rounded-lg">
                        <div>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.type === 'versement' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {tx.type}
                          </span>
                          <span className="text-slate-400 text-[11px] ml-2">
                            {new Date(tx.createdAt || tx.created_at).toLocaleDateString('fr-DZ')}
                          </span>
                          {tx.note && <div className="text-[10px] text-slate-400 mt-0.5">{tx.note}</div>}
                        </div>
                        <div className={`font-mono font-bold ${
                          tx.type === 'versement' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {tx.type === 'versement' ? '-' : '+'}{formatDZD(tx.amount)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center text-slate-500 text-xs">
              {isAr ? 'اختر زبوناً أو انقر مرتين لعرض التفاصيل' : 'Sélectionnez un client ou double-cliquez pour afficher son dossier'}
            </div>
          )}
        </div>
      </div>

      {/* Complete Dossier Modal */}
      {showDossierModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-800/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xl">
                  {selectedClient.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>{selectedClient.name}</span>
                    {selectedClient.isFidele && <span className="text-amber-400 text-sm">⭐ Client Fidèle</span>}
                  </h2>
                  <p className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                    <span>📞 {selectedClient.phone || 'Sans téléphone'}</span>
                    <span>📍 {selectedClient.address || 'Sans adresse'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVersementModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  + {isAr ? 'تسجيل دفعة' : 'Nouveau Versement'}
                </button>
                <button
                  onClick={() => setShowDossierModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KPI Summary Strip */}
            <div className="p-6 grid grid-cols-3 gap-4 bg-slate-950/50 border-b border-slate-800">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Total Achats (CA)</p>
                <p className="text-lg font-black font-mono text-blue-400 mt-0.5">
                  {formatDZD(
                    transactions
                      .filter((t: any) => t.type === 'achat')
                      .reduce((sum: number, t: any) => sum + t.amount, 0)
                  )}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Total Versements Réglés</p>
                <p className="text-lg font-black font-mono text-emerald-400 mt-0.5">
                  {formatDZD(
                    transactions
                      .filter((t: any) => t.type === 'versement')
                      .reduce((sum: number, t: any) => sum + t.amount, 0)
                  )}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] font-bold uppercase text-slate-400">Solde / Reste Dû (Dette)</p>
                <p className={`text-lg font-black font-mono mt-0.5 ${(selectedClient.currentDebt || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatDZD(selectedClient.currentDebt || 0)}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 flex items-center gap-2 border-b border-slate-800 bg-slate-900">
              <button
                onClick={() => setDossierTab('all')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  dossierTab === 'all'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {isAr ? 'سجل العمليات الكامل (Grand Livre)' : 'Journal Complet (Grand Livre)'}
              </button>
              <button
                onClick={() => setDossierTab('sales')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  dossierTab === 'sales'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {isAr ? 'تفاصيل فواتير الشراء' : 'Bons de Vente / Factures'}
              </button>
              <button
                onClick={() => setDossierTab('versements')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
                  dossierTab === 'versements'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {isAr ? 'سجل الدفعات' : 'Versements & Règlements'}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {dossierTab === 'all' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-800 text-slate-400 uppercase font-bold border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Réf / Note</th>
                      <th className="px-4 py-3 text-right">Débit (+)</th>
                      <th className="px-4 py-3 text-right">Crédit (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-500">Aucun historique</td></tr>
                    ) : (
                      transactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-slate-300">{new Date(tx.createdAt || tx.created_at).toLocaleString('fr-DZ')}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              tx.type === 'versement' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-sans text-slate-300">{tx.note || (tx.sale_id ? `Vente #${tx.sale_id}` : '—')}</td>
                          <td className="px-4 py-3 text-right text-rose-400 font-bold">
                            {tx.type === 'achat' ? formatDZD(tx.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                            {tx.type === 'versement' ? formatDZD(tx.amount) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {dossierTab === 'sales' && (
                <div className="space-y-4">
                  {clientSales.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      {isAr ? 'لا توجد فواتير بيع مسجلة لهذا الزبون' : 'Aucun ticket de caisse enregistré pour ce client'}
                    </div>
                  ) : (
                    clientSales.map((s: any) => (
                      <div key={s.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                          <div className="font-bold text-white">
                            Ticket #{s.id} • <span className="text-slate-400 font-mono">{new Date(s.createdAt || s.created_at).toLocaleString('fr-DZ')}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-blue-400">Total: {formatDZD(s.total)}</span>
                            <span className="font-mono font-bold text-emerald-400">Payé: {formatDZD(s.amountPaid || s.amount_paid || s.total)}</span>
                            {(s.amountCredit || s.amount_credit || 0) > 0 && (
                              <span className="font-mono font-bold text-rose-400">Crédit: {formatDZD(s.amountCredit || s.amount_credit)}</span>
                            )}
                          </div>
                        </div>

                        {s.items && s.items.length > 0 ? (
                          <table className="w-full text-[11px] text-left">
                            <thead className="text-slate-400 font-bold">
                              <tr>
                                <th className="pb-1">Article</th>
                                <th className="pb-1 text-center">Quantité</th>
                                <th className="pb-1 text-right">Prix Unitaire</th>
                                <th className="pb-1 text-right">Total Ligne</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-mono">
                              {s.items.map((it: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="py-1 font-sans text-slate-200">{it.productName || it.product_name || `Article #${it.productId || it.product_id}`}</td>
                                  <td className="py-1 text-center">{it.qty}</td>
                                  <td className="py-1 text-right">{formatDZD(it.unitPrice || it.unit_price)}</td>
                                  <td className="py-1 text-right text-emerald-400">{formatDZD(it.lineTotal || it.line_total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-[11px] text-slate-500">Détails articles non synchronisés</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {dossierTab === 'versements' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-800 text-slate-400 uppercase font-bold border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Montant Versé</th>
                      <th className="px-4 py-3">Note / Réf</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {transactions.filter((t: any) => t.type === 'versement').length === 0 ? (
                      <tr><td colSpan={3} className="py-8 text-center text-slate-500">Aucun versement enregistré</td></tr>
                    ) : (
                      transactions.filter((t: any) => t.type === 'versement').map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-slate-300">{new Date(tx.createdAt || tx.created_at).toLocaleString('fr-DZ')}</td>
                          <td className="px-4 py-3 text-emerald-400 font-bold">{formatDZD(tx.amount)}</td>
                          <td className="px-4 py-3 font-sans text-slate-300">{tx.note || 'Règlement'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowDossierModal(false)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {isAr ? 'إضافة زبون جديد' : 'Nouveau Client'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold">{isAr ? 'الاسم واللقب *' : 'Nom Complet *'}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={isAr ? 'اسم الزبون' : 'Ex: Ahmed Benali'}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold">{isAr ? 'رقم الهاتف' : 'Téléphone'}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="05 / 06 / 07..."
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold">{isAr ? 'العنوان' : 'Adresse'}</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder={isAr ? 'المدينة / الحي' : 'Ex: Bab Ezzouar, Alger'}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isFidele"
                  checked={isFidele}
                  onChange={e => setIsFidele(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="isFidele" className="text-slate-300 font-semibold cursor-pointer">
                  {isAr ? 'زبون وفي (Fidèle - يستفيد من تخفيضات)' : 'Client Fidèle (Bénéficie de remises)'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white rounded-xl"
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md shadow-blue-600/30"
                >
                  {isAr ? 'حفظ الزبون' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Versement Modal */}
      {showVersementModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {isAr ? 'تسجيل دفعة زبون (تسديد دين)' : 'Nouveau Versement Client'}
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
