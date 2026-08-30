import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Settings, Printer, Building2, Save, FileText, CheckCircle2, RefreshCw, Sparkles, Check, Keyboard, ToggleLeft, ToggleRight } from 'lucide-react';

interface SystemPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
  type: string;
}

const SHORTCUT_LABELS: Record<string, { fr: string; ar: string }> = {
  goto_pos: { fr: 'Aller à la Caisse (POS)', ar: 'الذهاب لنقطة البيع' },
  goto_produits: { fr: 'Aller aux Produits', ar: 'الذهاب للمنتجات' },
  goto_stock: { fr: 'Aller au Stock', ar: 'الذهاب للمخزون' },
  goto_achat: { fr: 'Aller aux Achats', ar: 'الذهاب للمشتريات' },
  goto_clients: { fr: 'Aller aux Clients', ar: 'الذهاب للزبائن' },
  goto_fournisseurs: { fr: 'Aller aux Fournisseurs', ar: 'الذهاب للموردين' },
  goto_rapport: { fr: 'Aller aux Rapports', ar: 'الذهاب للتقارير' },
  goto_depenses: { fr: 'Aller aux Dépenses', ar: 'الذهاب للمصاريف' },
  goto_settings: { fr: 'Aller aux Paramètres', ar: 'الذهاب للإعدادات' },
  confirm: { fr: 'Confirmer / Valider', ar: 'تأكيد' },
  cancel: { fr: 'Annuler / Fermer', ar: 'إلغاء' },
  retour: { fr: 'Initier un Retour', ar: 'إرجاع بضاعة' },
  edit_product: { fr: 'Modifier le Produit sélectionné', ar: 'تعديل المنتج' },
  add_product: { fr: 'Ajouter un Produit', ar: 'إضافة منتج' },
  search: { fr: 'Recherche Globale', ar: 'بحث شامل' },
  clear_cart: { fr: 'Vider le Panier', ar: 'تفريغ السلة' },
  print_receipt: { fr: 'Imprimer le Ticket', ar: 'طباعة التذكرة' },
  toggle_price_tier: { fr: 'Changer Tarif (Détail / Semi / Gros)', ar: 'تغيير صنف السعر' },
  save: { fr: 'Sauvegarder', ar: 'حفظ' },
  toggle_session: { fr: 'Ouvrir / Fermer la Session Caisse', ar: 'فتح أو إغلاق جلسة الصندوق' },
};

export const SettingsPage: React.FC = () => {
  const { currentStore, hasPermission, lang, theme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [printerType, setPrinterType] = useState<'usb' | 'network' | 'none'>('usb');
  const [printerTarget, setPrinterTarget] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [nif, setNif] = useState('');
  const [nis, setNis] = useState('');
  const [rc, setRc] = useState('');
  const [articleImposition, setArticleImposition] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Avg Price Mode setting
  const [avgPriceMode, setAvgPriceMode] = useState(true);

  // System Printers Detection
  const [availablePrinters, setAvailablePrinters] = useState<SystemPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testPrintOutput, setTestPrintOutput] = useState<string | null>(null);

  // Keyboard Shortcuts
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [shortcutsSaved, setShortcutsSaved] = useState(false);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const list = await invokeIpc<SystemPrinter[]>('get-printers');
      if (list && list.length > 0) {
        setAvailablePrinters(list);
        if (!printerTarget && list.length > 0) {
          const defaultP = list.find(p => p.isDefault) || list[0];
          setPrinterTarget(defaultP.name);
        }
      }
    } catch (err) {
      console.error('Error loading printers:', err);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    invokeIpc<any>('get-settings', currentStore?.id || 1).then(s => {
      if (s) {
        setStoreName(s.storeName || s.store_name || '');
        setAddress(s.address || '');
        setPhone(s.phone || '');
        setPrinterType(s.printerType || s.printer_type || 'usb');
        setPrinterTarget(s.printerTarget || s.printer_target || '');
        setReceiptFooter(s.receiptFooter || s.receipt_footer || '');
        setNif(s.nif || '');
        setNis(s.nis || '');
        setRc(s.rc || '');
        setArticleImposition(s.articleImposition || s.article_imposition || '');
        setAvgPriceMode(s.avg_price_mode !== 0);
      }
    });

    invokeIpc<Record<string, string>>('get-shortcuts').then(sc => {
      if (sc) setShortcuts(sc);
    });

    loadPrinters();
  }, [currentStore]);

  // Capture key for shortcut
  const handleShortcutKeyDown = (e: React.KeyboardEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturingAction(null);
      return;
    }
    const parts = [
      e.ctrlKey && 'Control',
      e.shiftKey && 'Shift',
      e.altKey && 'Alt',
      e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key
    ].filter(Boolean) as string[];
    if (parts.length === 0) return;
    setShortcuts(prev => ({ ...prev, [action]: parts.join('+') }));
    setCapturingAction(null);
  };

  const handleSaveShortcuts = async () => {
    try {
      await invokeIpc('save-shortcuts', shortcuts);
      setShortcutsSaved(true);
      setTimeout(() => setShortcutsSaved(false), 2500);
    } catch (err: any) {
      alert(`Erreur raccourcis: ${err.message}`);
    }
  };

  const handleTestPrint = async () => {
    try {
      const res = await invokeIpc<{ success: boolean; receiptText: string }>('print-receipt', {
        sale: { id: 999999, total: 450000, paymentType: 'cash' },
        store: currentStore,
        settings: { storeName, address, phone, receiptFooter },
        cashierName: 'Test Caissier'
      });
      setTestPrintOutput(res?.receiptText || 'Ticket test imprimé avec succès !');
    } catch (err: any) {
      alert(`Erreur impression: ${err.message}`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invokeIpc('save-settings', {
        storeId: currentStore?.id || 1,
        storeName,
        address,
        phone,
        printerType,
        printerTarget,
        receiptFooter,
        nif,
        nis,
        rc,
        articleImposition,
        avgPriceMode
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  return (
    <div className={`p-6 space-y-6 h-full overflow-y-auto transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <Settings className="w-5 h-5 text-blue-500" />
            <span>{isAr ? 'إعدادات المحل والطباعة والبيانات الجبائية' : 'Paramètres du Magasin & Impression'}</span>
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {isAr 
              ? 'تخصيص تذكرة الصندوق، التعرف التلقائي على طابعات Windows، والمعلومات الجبائية' 
              : 'Détection automatique des imprimantes connectées au PC, configuration ticket 80mm et mentions fiscales algériennes.'}
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>{isAr ? 'تم حفظ الإعدادات بنجاح!' : 'Paramètres enregistrés avec succès !'}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* Section 1: Thermal Receipt Printer Selection */}
        <div className={`p-5 rounded-2xl border shadow-sm space-y-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Printer className="w-4 h-4 text-purple-500" />
              <span>1. {isAr ? 'طابعة التذاكر الحرارية (80 مم)' : 'Imprimante Thermique Tickets de Caisse (80mm)'}</span>
            </h3>

            <button
              type="button"
              onClick={loadPrinters}
              disabled={loadingPrinters}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-xl border transition-all ${
                isDark ? 'bg-slate-800 border-slate-700 text-blue-400 hover:text-white' : 'bg-slate-100 border-slate-300 text-blue-600 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث قائمة الطابعات' : 'Détecter les Imprimantes'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'اختر الطابعة المتصلة بالحاسوب :' : 'Imprimante Système Installée sur ce PC :'}
              </label>
              <select
                value={printerTarget}
                onChange={e => setPrinterTarget(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3 py-2.5 text-xs font-bold outline-none cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                {availablePrinters.map((p, idx) => (
                  <option key={idx} value={p.name}>
                    {p.name} {p.isDefault ? '(Par Défaut)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                {availablePrinters.length} imprimante(s) Windows détectée(s) sur cette machine.
              </p>
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'نوع بروتوكول الطباعة :' : 'Protocole d\'Impression :'}
              </label>
              <select
                value={printerType}
                onChange={e => setPrinterType(e.target.value as any)}
                className={`w-full mt-1.5 border rounded-xl px-3 py-2.5 text-xs font-bold outline-none cursor-pointer ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                <option value="usb">Pilote USB Windows / ESC-POS Direct</option>
                <option value="network">Réseau Ethernet / IP (Port 9100)</option>
                <option value="none">Virtuelle (Aperçu à l'écran)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'نص أسفل التذكرة (Message Pied de Ticket) :' : 'Message de Pied de Ticket :'}
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={e => setReceiptFooter(e.target.value)}
                placeholder="Ex: Merci pour votre confiance ! Pièces garanties 3 mois."
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-800/40">
            <span className="text-xs text-slate-400">
              Imprimante active liée : <strong className="text-emerald-400 font-mono">{printerTarget || 'Aucune'}</strong>
            </span>

            <button
              type="button"
              onClick={handleTestPrint}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-md shadow-purple-600/30 flex items-center gap-2 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة تذكرة تجريبية 80 مم' : 'Imprimer un Ticket Test 80mm'}</span>
            </button>
          </div>

          {testPrintOutput && (
            <div className="p-4 bg-slate-950 rounded-2xl border border-purple-500/30 font-mono text-[11px] text-purple-300 whitespace-pre-wrap">
              {testPrintOutput}
            </div>
          )}
        </div>

        {/* Section 2: Store Profile */}
        <div className={`p-5 rounded-2xl border shadow-sm space-y-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Building2 className="w-4 h-4 text-blue-500" />
            <span>2. {isAr ? 'بيانات المحل' : 'Profil du Magasin'}</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'اسم المحل' : 'Nom de l\'Enseigne'}
              </label>
              <input
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'رقم الهاتف' : 'Téléphone'}
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="md:col-span-2">
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'العنوان' : 'Adresse Commerciale'}
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Algerian Fiscal Information */}
        <div className={`p-5 rounded-2xl border shadow-sm space-y-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>3. {isAr ? 'المعلومات الجبائية الرسمية' : 'Mentions Fiscales Algériennes'}</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>NIF (الرقم الجبائي)</label>
              <input
                type="text"
                placeholder="000000000000000"
                value={nif}
                onChange={e => setNif(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>NIS (الإحصائي)</label>
              <input
                type="text"
                placeholder="00000000000"
                value={nis}
                onChange={e => setNis(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>RC (السجل التجاري)</label>
              <input
                type="text"
                placeholder="16/00-0000000B16"
                value={rc}
                onChange={e => setRc(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>AI (رقم المادة)</label>
              <input
                type="text"
                placeholder="16000000000"
                value={articleImposition}
                onChange={e => setArticleImposition(e.target.value)}
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Section: Prix Moyen à l'Achat */}
        <div className={`space-y-3 p-4 rounded-2xl border ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {isAr ? 'حساب سعر الشراء' : 'Calcul du Prix d\'Achat'}
          </h4>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isAr ? 'متوسط سعر الشراء عند استلام البضاعة' : 'Moyenne du prix d\'achat lors d\'une réception de stock'}
              </p>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {avgPriceMode
                  ? (isAr ? '✅ مفعّل — سعر جديد = (القديم + الجديد) ÷ 2' : '✅ Activé — Nouveau prix = (ancien + nouveau) ÷ 2')
                  : (isAr ? '❌ معطّل — يُؤخذ سعر الشراء الجديد مباشرة' : '❌ Désactivé — le nouveau prix d\'achat remplace l\'ancien')
                }
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAvgPriceMode(!avgPriceMode)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs border transition-all ${
                avgPriceMode
                  ? (isDark ? 'bg-amber-950/50 border-amber-700/50 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-700')
                  : (isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-300 text-slate-500')
              }`}
            >
              {avgPriceMode ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {avgPriceMode ? (isAr ? 'مفعّل' : 'Activé') : (isAr ? 'معطّل' : 'Désactivé')}
            </button>
          </div>
        </div>

        {/* Submit */}
        {hasPermission('settings', 'edit') && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isAr ? 'حفظ كافة الإعدادات' : 'Enregistrer les Paramètres'}</span>
            </button>
          </div>
        )}
      </form>

      {/* Section: Raccourcis Clavier (outside form, separate save) */}
      <div className={`space-y-3 p-4 rounded-2xl border ${
        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between">
          <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <Keyboard className="w-3.5 h-3.5 text-blue-500" />
            {isAr ? 'اختصارات لوحة المفاتيح (20 أمر)' : 'Raccourcis Clavier (20 actions)'}
          </h4>
          <button
            onClick={handleSaveShortcuts}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs border transition-all ${
              shortcutsSaved
                ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-300'
                : (isDark ? 'bg-blue-950/50 border-blue-700/50 text-blue-300 hover:bg-blue-900/30' : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100')
            }`}
          >
            {shortcutsSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {shortcutsSaved ? (isAr ? 'محفوظ!' : 'Sauvegardé!') : (isAr ? 'حفظ الاختصارات' : 'Sauvegarder les Raccourcis')}
          </button>
        </div>

        <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {isAr ? 'انقر على حقل الاختصار ثم اضغط أي زر للتسجيل. اضغط Echap للإلغاء.' : 'Cliquez sur un champ de raccourci puis appuyez la touche souhaitée. Echap pour annuler.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(SHORTCUT_LABELS).map(([action, labels]) => (
            <div
              key={action}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? labels.ar : labels.fr}
              </span>
              <div
                tabIndex={0}
                onFocus={() => setCapturingAction(action)}
                onBlur={() => setCapturingAction(null)}
                onKeyDown={capturingAction === action ? (e) => handleShortcutKeyDown(e, action) : undefined}
                className={`flex-shrink-0 min-w-[100px] text-center px-3 py-1.5 rounded-lg border cursor-pointer select-none text-[11px] font-mono font-bold transition-all outline-none ${
                  capturingAction === action
                    ? 'bg-blue-600 border-blue-500 text-white ring-2 ring-blue-400 ring-offset-1'
                    : (isDark ? 'bg-slate-800 border-slate-700 text-amber-300 hover:border-blue-500' : 'bg-slate-100 border-slate-300 text-amber-700 hover:border-blue-400')
                }`}
              >
                {capturingAction === action
                  ? (isAr ? '🎹 اضغط...' : '🎹 Appuyez...')
                  : (shortcuts[action] || '—')
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
