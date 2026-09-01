import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { 
  Settings, 
  Printer, 
  Building2, 
  Save, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles, 
  Check, 
  Keyboard, 
  ToggleLeft, 
  ToggleRight,
  FolderPlus,
  Tag,
  Bike,
  Palette,
  Trash2,
  Plus,
  Sliders,
  Layers
} from 'lucide-react';

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

  const [activeTab, setActiveTab] = useState<'general' | 'catalog' | 'shortcuts'>('general');

  // Store & Invoice Settings
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
  const [avgPriceMode, setAvgPriceMode] = useState(true);

  // System Printers Detection
  const [availablePrinters, setAvailablePrinters] = useState<SystemPrinter[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testPrintOutput, setTestPrintOutput] = useState<string | null>(null);

  // Keyboard Shortcuts
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [shortcutsSaved, setShortcutsSaved] = useState(false);

  // Catalog Metadata Management
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [colors, setColors] = useState<any[]>([]);

  // New Entity Inputs
  const [newCatName, setNewCatName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newMotoName, setNewMotoName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#3b82f6');
  const [metadataMsg, setMetadataMsg] = useState('');

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

  const loadMetadata = async () => {
    try {
      const meta = await invokeIpc<any>('get-metadata');
      if (meta) {
        setCategories(meta.categories || []);
        setBrands(meta.brands || []);
        setMotorcycles(meta.motorcycleModels || []);
        setColors(meta.colors || []);
      }
    } catch (err) {
      console.error('Error loading metadata:', err);
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
    loadMetadata();
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
        items: [
          { name: 'Plaquettes Frein Brembo', qty: 2, unitPrice: 220000, lineTotal: 440000 },
          { name: 'Bougie NGK CR8EIX', qty: 1, unitPrice: 140000, lineTotal: 140000 }
        ],
        store: { name: storeName || 'CYCLES & MOTOS DZ', phone, address, receiptFooter }
      });
      if (res && res.receiptText) {
        setTestPrintOutput(res.receiptText);
      }
    } catch (err: any) {
      alert(`Erreur impression test: ${err.message}`);
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
        taxRate: 0,
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

  // Add Metadata Handlers
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await invokeIpc<any>('add-category', newCatName.trim().toUpperCase());
      if (res && res.id) {
        setCategories([...categories, { id: res.id, name: res.name }]);
        setNewCatName('');
        showMetaSuccess(`Catégorie "${res.name}" ajoutée !`);
      }
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm(isAr ? 'حذف هذا الصنف؟' : 'Supprimer cette catégorie ?')) return;
    await invokeIpc('delete-category', id);
    setCategories(categories.filter(c => c.id !== id));
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    try {
      const res = await invokeIpc<any>('add-brand', newBrandName.trim().toUpperCase());
      if (res && res.id) {
        setBrands([...brands, { id: res.id, name: res.name }]);
        setNewBrandName('');
        showMetaSuccess(`Marque "${res.name}" ajoutée !`);
      }
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleDeleteBrand = async (id: number) => {
    if (!confirm(isAr ? 'حذف هذه الماركة؟' : 'Supprimer cette marque ?')) return;
    await invokeIpc('delete-brand', id);
    setBrands(brands.filter(b => b.id !== id));
  };

  const handleAddMotorcycle = async () => {
    if (!newMotoName.trim()) return;
    try {
      const res = await invokeIpc<any>('add-motorcycle-model', newMotoName.trim().toUpperCase());
      if (res && res.id) {
        setMotorcycles([...motorcycles, { id: res.id, name: res.name }]);
        setNewMotoName('');
        showMetaSuccess(`Machine "${res.name}" ajoutée !`);
      }
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleDeleteMotorcycle = async (id: number) => {
    if (!confirm(isAr ? 'حذف هذا الطراز؟' : 'Supprimer ce modèle de moto ?')) return;
    await invokeIpc('delete-motorcycle-model', id);
    setMotorcycles(motorcycles.filter(m => m.id !== id));
  };

  const handleAddColor = async () => {
    if (!newColorName.trim()) return;
    try {
      const res = await invokeIpc<any>('add-color', {
        name: newColorName.trim().toUpperCase(),
        hexCode: newColorHex
      });
      if (res && res.id) {
        setColors([...colors, { id: res.id, name: res.name, hexCode: res.hexCode }]);
        setNewColorName('');
        showMetaSuccess(`Couleur "${res.name}" ajoutée !`);
      }
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleDeleteColor = async (id: number) => {
    if (!confirm(isAr ? 'حذف هذا اللون؟' : 'Supprimer cette couleur ?')) return;
    await invokeIpc('delete-color', id);
    setColors(colors.filter(c => c.id !== id));
  };

  const showMetaSuccess = (msg: string) => {
    setMetadataMsg(msg);
    setTimeout(() => setMetadataMsg(''), 3000);
  };

  return (
    <div className={`p-6 space-y-6 h-full overflow-y-auto transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <Settings className="w-5 h-5 text-blue-500" />
            <span>{isAr ? 'إعدادات النظام والكتالوج' : 'Paramètres du Système & Données'}</span>
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {isAr ? 'تهيئة معلومات المحل، الطابعات، الأصناف، الماركات، الدراجات، الألوان والاختصارات' : 'Configuration des coordonnées, imprimantes, catégories, marques, machines, couleurs et raccourcis.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className={`p-1 rounded-2xl border flex items-center gap-1 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'المحل والتذاكر' : 'Général & Tickets'}</span>
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isAr ? 'الأصناف والموتوات والألوان' : 'Catégories, Motos & Couleurs'}</span>
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'shortcuts'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{isAr ? 'اختصارات الكيبورد' : 'Raccourcis Clavier'}</span>
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {savedSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{isAr ? 'تم حفظ الإعدادات بنجاح!' : 'Paramètres enregistrés avec succès !'}</span>
        </div>
      )}

      {metadataMsg && (
        <div className="bg-purple-500/10 border border-purple-500/30 text-purple-300 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{metadataMsg}</span>
        </div>
      )}

      {/* TAB 1: GENERAL & PRINTERS */}
      {activeTab === 'general' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Store Coordinates */}
          <div className={`space-y-3 p-4 rounded-2xl border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              1. {isAr ? 'معلومات المحل ونقطة البيع' : 'Coordonnées du Magasin'}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'اسم المحل' : 'Nom du Magasin'}</label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={e => setStoreName(e.target.value.toUpperCase())}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none uppercase ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'رقم الهاتف' : 'Téléphone'}</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'العنوان' : 'Adresse'}</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value.toUpperCase())}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none uppercase ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Printers */}
          <div className={`space-y-3 p-4 rounded-2xl border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <Printer className="w-3.5 h-3.5 text-blue-500" />
                2. {isAr ? 'إعدادات الطابعة الحرارية (80mm)' : 'Configuration Imprimante Thermique (80mm)'}
              </h4>
              <button
                type="button"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'تحديث قائمة الطابعات' : 'Actualiser'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'نوع المنفذ' : 'Type de Connexion'}</label>
                <select
                  value={printerType}
                  onChange={e => setPrinterType(e.target.value as any)}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="usb">USB / Windows Spooler Direct</option>
                  <option value="network">Réseau Ethernet / WiFi (ESC/POS 9100)</option>
                  <option value="none">Désactivée (Simulation Console)</option>
                </select>
              </div>

              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {printerType === 'usb' ? (isAr ? 'الطابعة المكتشفة' : 'Imprimante Détectée') : (isAr ? 'عنوان IP:Port' : 'Adresse IP:Port')}
                </label>
                {printerType === 'usb' && availablePrinters.length > 0 ? (
                  <select
                    value={printerTarget}
                    onChange={e => setPrinterTarget(e.target.value)}
                    className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                      isDark ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-white border-slate-300 text-emerald-700'
                    }`}
                  >
                    {availablePrinters.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name} {p.isDefault ? '⭐ (Par défaut)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder={printerType === 'usb' ? 'Ex: Xprinter XP-80' : 'Ex: 192.168.1.200:9100'}
                    value={printerTarget}
                    onChange={e => setPrinterTarget(e.target.value)}
                    className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                      isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                )}
              </div>

              <div className="md:col-span-2">
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{isAr ? 'تذييل التذكرة' : 'Pied de page du Ticket'}</label>
                <input
                  type="text"
                  placeholder="Merci pour votre confiance ! Pièces garanties."
                  value={receiptFooter}
                  onChange={e => setReceiptFooter(e.target.value)}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={handleTestPrint}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>{isAr ? 'طباعة تذكرة تجريبية' : 'Imprimer Ticket Test (ESC/POS)'}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Legal Data */}
          <div className={`space-y-3 p-4 rounded-2xl border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              3. {isAr ? 'المعلومات الجبائية والقانونية' : 'Mentions Fiscales & Légales (Algérie)'}
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>NIF (الرقم الجبائي)</label>
                <input
                  type="text"
                  placeholder="099816000000000"
                  value={nif}
                  onChange={e => setNif(e.target.value)}
                  className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold outline-none ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>NIS (رقم الإحصاء)</label>
                <input
                  type="text"
                  placeholder="0001160000000"
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

          {/* Section: Prix Moyen Mode */}
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
      )}

      {/* TAB 2: CATALOG METADATA (Categories, Brands, Motos, Colors) */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Categories */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-xs uppercase flex items-center gap-2 text-blue-400">
                <FolderPlus className="w-4 h-4" />
                <span>{isAr ? 'الأصناف' : 'Catégories'} ({categories.length})</span>
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: FREINAGE, CARROSSERIE..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value.toUpperCase())}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none uppercase ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة' : 'Ajouter'}</span>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {categories.map(c => (
                <div key={c.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="font-bold">{c.name}</span>
                  <button onClick={() => handleDeleteCategory(c.id)} className="text-slate-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Brands */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-xs uppercase flex items-center gap-2 text-emerald-400">
                <Tag className="w-4 h-4" />
                <span>{isAr ? 'الماركات / المصنعين' : 'Marques / Fabricants'} ({brands.length})</span>
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: BREMBO, MOTUL, NGK..."
                value={newBrandName}
                onChange={e => setNewBrandName(e.target.value.toUpperCase())}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none uppercase ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={handleAddBrand}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة' : 'Ajouter'}</span>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {brands.map(b => (
                <div key={b.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="font-bold">{b.name}</span>
                  <button onClick={() => handleDeleteBrand(b.id)} className="text-slate-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Motorcycle Models */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-xs uppercase flex items-center gap-2 text-cyan-400">
                <Bike className="w-4 h-4" />
                <span>{isAr ? 'طرازات الدراجات والموتوات (Machines)' : 'Machines / Modèles Motos'} ({motorcycles.length})</span>
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: SYM SYMPHONY, VMS CUXI..."
                value={newMotoName}
                onChange={e => setNewMotoName(e.target.value.toUpperCase())}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none uppercase ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={handleAddMotorcycle}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة' : 'Ajouter'}</span>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {motorcycles.map(m => (
                <div key={m.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="font-bold">{m.name}</span>
                  <button onClick={() => handleDeleteMotorcycle(m.id)} className="text-slate-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Colors */}
          <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-xs uppercase flex items-center gap-2 text-purple-400">
                <Palette className="w-4 h-4" />
                <span>{isAr ? 'الألوان' : 'Couleurs'} ({colors.length})</span>
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom (ex: NOIR BRILLANT)"
                value={newColorName}
                onChange={e => setNewColorName(e.target.value.toUpperCase())}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none uppercase ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                }`}
              />
              <input
                type="color"
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                className="w-9 h-9 rounded-xl border-0 cursor-pointer p-0 shrink-0"
              />
              <button
                type="button"
                onClick={handleAddColor}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة' : 'Ajouter'}</span>
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-1.5 pr-1">
              {colors.map(c => (
                <div key={c.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 shadow-sm" style={{ backgroundColor: c.hexCode || c.hex_code }} />
                    <span className="font-bold truncate text-[11px]">{c.name}</span>
                  </div>
                  <button onClick={() => handleDeleteColor(c.id)} className="text-slate-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: KEYBOARD SHORTCUTS */}
      {activeTab === 'shortcuts' && (
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
      )}
    </div>
  );
};
