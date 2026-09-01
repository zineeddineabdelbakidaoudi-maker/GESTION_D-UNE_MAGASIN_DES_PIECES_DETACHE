import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { Product, ColorMode } from '@gestion-veloo/shared';
import { formatDZD } from '@gestion-veloo/shared';
import { COLOR_MODES, COLOR_MODE_LABELS } from '@gestion-veloo/shared';
import { generateBarcodeValue } from '@gestion-veloo/shared';
import { 
  PackagePlus, 
  FileText, 
  Search, 
  Barcode, 
  Plus, 
  X, 
  Printer, 
  Palette, 
  Pen, 
  Wrench, 
  Camera, 
  Bike
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const ProductsPage: React.FC = () => {
  const { currentStore, setCapital, hasPermission, lang, theme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [colors, setColors] = useState<any[]>([]);
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [customCode, setCustomCode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [brandId, setBrandId] = useState<number | ''>('');
  const [priceAchat, setPriceAchat] = useState<string>('');
  const [priceDetail, setPriceDetail] = useState<string>('');
  const [priceSemiGros, setPriceSemiGros] = useState<string>('');
  const [priceGros, setPriceGros] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [colorMode, setColorMode] = useState<ColorMode>('single');
  const [selectedColorId, setSelectedColorId] = useState<number | ''>('');
  const [variantColorIds, setVariantColorIds] = useState<number[]>([]);
  const [mergeColorIds, setMergeColorIds] = useState<number[]>([]);
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [barcodesList, setBarcodesList] = useState<string[]>([]);
  const [compatibleMotos, setCompatibleMotos] = useState<number[]>([]);
  const [motoSearchFilter, setMotoSearchFilter] = useState('');
  const [initialStockStore1, setInitialStockStore1] = useState('0');
  const [photoBase64, setPhotoBase64] = useState<string>('');

  // Inline Add New Color State
  const [showAddColorForm, setShowAddColorForm] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#3b82f6');

  // Hover Tooltip (2s delay for compat motos)
  const [hoveredProductRow, setHoveredProductRow] = useState<Product | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hoverRowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Proforma Modal State
  const [showProformaModal, setShowProformaModal] = useState(false);
  const [proformaItems, setProformaItems] = useState<Array<{ product: Product; qty: number; price: number }>>([]);
  const [proformaClientName, setProformaClientName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, meta, locs] = await Promise.all([
        invokeIpc<Product[]>('get-products', { q: search, storeId: currentStore?.id || 1 }),
        invokeIpc<any>('get-metadata'),
        invokeIpc<string[]>('get-locations').catch(() => [])
      ]);

      setProducts(prods || []);
      if (meta) {
        setCategories(meta.categories || []);
        setBrands(meta.brands || []);
        setColors(meta.colors || []);
        setMotorcycles(meta.motorcycleModels || []);
      }
      setLocations(locs || []);

      if (prods) {
        const cap = prods.reduce((acc, p) => {
          const qty = p.stock?.find(s => s.storeId === (currentStore?.id || 1))?.quantity || 0;
          return acc + (p.priceAchat * qty);
        }, 0);
        setCapital(cap);
      }
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, currentStore]);

  const handleAddManualBarcode = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualBarcode.trim();
    if (!val) return;
    if (barcodesList.length >= 5) {
      alert(isAr ? 'الحد الأقصى 5 رموز شريطية لكل قطعة' : 'Maximum 5 codes-barres par produit');
      return;
    }
    if (barcodesList.includes(val)) {
      alert(isAr ? 'الرمز الشريطي موجود بالفعل' : 'Ce code-barres existe déjà');
      return;
    }
    setBarcodesList([...barcodesList, val]);
    setManualBarcode('');
  };

  const handleGenerateAutoBarcode = () => {
    if (barcodesList.length >= 5) {
      alert(isAr ? 'الحد الأقصى 5 رموز شريطية لكل قطعة' : 'Maximum 5 codes-barres par produit');
      return;
    }
    const tempNextId = (products.length || 0) + 1;
    const generated = generateBarcodeValue(tempNextId);
    if (!barcodesList.includes(generated)) {
      setBarcodesList([...barcodesList, generated]);
    }
  };

  const handleRemoveBarcode = (bc: string) => {
    setBarcodesList(barcodesList.filter(b => b !== bc));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(isAr ? 'حجم الصورة كبير جداً (أقصى حد 2 ميغا)' : 'Photo trop volumineuse (max 2 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddNewColor = async () => {
    if (!newColorName.trim()) return;
    try {
      const res = await invokeIpc<any>('add-color', { 
        name: newColorName.trim().toUpperCase(), 
        hexCode: newColorHex 
      });
      if (res && res.id) {
        setColors([...colors, { id: res.id, name: res.name, hexCode: res.hexCode }]);
        setSelectedColorId(res.id);
        setNewColorName('');
        setShowAddColorForm(false);
        alert(isAr ? 'تمت إضافة اللون بنجاح' : `Couleur "${res.name}" ajoutée avec succès !`);
      }
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pAchat = Math.round(parseFloat(priceAchat || '0') * 100);
      const pDetail = Math.round(parseFloat(priceDetail || '0') * 100);
      const pSemi = Math.round(parseFloat(priceSemiGros || priceDetail || '0') * 100);
      const pGros = Math.round(parseFloat(priceGros || priceDetail || '0') * 100);

      if (!name.trim()) throw new Error(isAr ? 'اسم القطعة مطلوب' : 'Nom du produit obligatoire');
      if (pDetail <= 0) throw new Error(isAr ? 'سعر التجزئة يجب أن يكون أكبر من 0' : 'Prix détail obligatoire');

      const payload: any = {
        name: name.toUpperCase().trim(),
        customCode: customCode.trim() ? customCode.trim().toUpperCase() : undefined,
        categoryId: categoryId || null,
        brandId: brandId || null,
        priceAchat: pAchat,
        priceDetail: pDetail,
        priceSemiGros: pSemi || pDetail,
        priceGros: pGros || pDetail,
        location: location.toUpperCase().trim(),
        colorMode,
        colorIds: colorMode === 'single' ? (selectedColorId ? [Number(selectedColorId)] : []) : variantColorIds,
        mergeColorIds: colorMode === 'merged' ? mergeColorIds : [],
        barcodes: barcodesList,
        compatibleModelIds: compatibleMotos,
        compatibleMotos: compatibleMotos,
        initialStock: {
          '1': parseInt(initialStockStore1, 10) || 0
        }
      };

      if (editingProduct) {
        await invokeIpc('update-product', { ...payload, id: editingProduct.id });
        if (photoBase64) {
          await invokeIpc('update-product-photo', { productId: editingProduct.id, photoBase64 });
        }
        alert(isAr ? 'تم تعديل المنتج بنجاح!' : 'Produit modifié avec succès !');
      } else {
        const created = await invokeIpc<any>('create-product', payload);
        if (created?.id && photoBase64) {
          await invokeIpc('update-product-photo', { productId: created.id, photoBase64 });
        }
        alert(isAr ? 'تمت إضافة المنتج بنجاح!' : 'Produit créé avec succès !');
      }
      setShowAddModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setCustomCode('');
    setName('');
    setCategoryId('');
    setBrandId('');
    setPriceAchat('');
    setPriceDetail('');
    setPriceSemiGros('');
    setPriceGros('');
    setLocation('');
    setColorMode('single');
    setSelectedColorId('');
    setVariantColorIds([]);
    setMergeColorIds([]);
    setBarcodesList([]);
    setManualBarcode('');
    setCompatibleMotos([]);
    setMotoSearchFilter('');
    setInitialStockStore1('0');
    setPhotoBase64('');
    setShowAddColorForm(false);
    setNewColorName('');
    setNewColorHex('#3b82f6');
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setCustomCode(p.code);
    setName(p.name);
    setCategoryId(p.categoryId || '');
    setBrandId(p.brandId || '');
    setPriceAchat(String((p.priceAchat || 0) / 100));
    setPriceDetail(String((p.priceDetail || 0) / 100));
    setPriceSemiGros(String((p.priceSemiGros || p.priceDetail || 0) / 100));
    setPriceGros(String((p.priceGros || p.priceDetail || 0) / 100));
    setLocation((p as any).location || '');
    setColorMode(p.colorMode);
    const colorIds = (p.colors || []).map((c: any) => c.colorId);
    if (p.colorMode === 'single') setSelectedColorId(colorIds[0] || '');
    else if (p.colorMode === 'variants') setVariantColorIds(colorIds);
    else if (p.colorMode === 'merged') setMergeColorIds(colorIds);
    setBarcodesList((p.barcodes || []).map((b: any) => b.barcodeValue));
    setCompatibleMotos(((p as any).compatibleModels || []).map((m: any) => m.id));
    setPhotoBase64((p as any).photo_base64 || '');
    setMotoSearchFilter('');
    setInitialStockStore1('0');
    setShowAddModal(true);
  };

  const generateProformaPDF = () => {
    if (proformaItems.length === 0) return;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('FACTURE PROFORMA', 14, 20);

    doc.setFontSize(10);
    doc.text(`Magasin: ${currentStore?.name || 'Cycles & Motos'}`, 14, 28);
    doc.text(`Client: ${proformaClientName || 'Client Comptoir'}`, 14, 34);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-DZ')}`, 14, 40);

    const tableData = proformaItems.map((item, index) => [
      (index + 1).toString(),
      item.product.code,
      item.product.name,
      item.qty.toString(),
      formatDZD(item.price),
      formatDZD(item.qty * item.price)
    ]);

    (doc as any).autoTable({
      startY: 46,
      head: [['#', 'Code', 'Désignation', 'Qté', 'Prix Unitaire', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] }
    });

    const total = proformaItems.reduce((acc, item) => acc + (item.qty * item.price), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text(`Total Proforma: ${formatDZD(total)}`, 14, finalY);
    doc.save(`Proforma_${Date.now()}.pdf`);
  };

  const filteredMotos = motorcycles.filter(m => 
    !motoSearchFilter || m.name.toLowerCase().includes(motoSearchFilter.toLowerCase())
  );

  // Category conditional check for color picker
  const selectedCat = categories.find(c => c.id === categoryId);
  const catNameLower = (selectedCat?.name || '').toLowerCase();
  const shouldShowColors = !categoryId || 
    catNameLower.includes('carénage') || 
    catNameLower.includes('carenage') || 
    catNameLower.includes('carinage') || 
    catNameLower.includes('accessoire') || 
    catNameLower.includes('access') ||
    catNameLower.includes('carrosserie') ||
    catNameLower.includes('couleur');

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
            <PackagePlus className="w-5 h-5 text-blue-500" />
            <span>{isAr ? 'كتالوج المنتجات والتقديرات الشكلية' : 'Catalogue Produits & Factures Proforma'}</span>
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {isAr 
              ? 'إدارة القطع، الألوان، التوافق مع الموتوات، وإمكانية إضافة الصور ومواقع التخزين' 
              : 'Gestion des pièces, codes manuels, photos, emplacements en rayon et compatibilités motos.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProformaModal(true)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-all shadow-sm ${
              isDark ? 'bg-slate-900 border-slate-800 text-emerald-400 hover:bg-slate-800' : 'bg-white border-slate-300 text-emerald-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'فاتورة شكلية (Proforma)' : 'Devis Proforma (PDF)'}</span>
          </button>

          {hasPermission('produits', 'edit') && (
            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all"
            >
              <PackagePlus className="w-4 h-4" />
              <span>{isAr ? 'إضافة قطعة جديدة' : 'Nouveau Produit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className={`p-3.5 rounded-2xl border shadow-sm flex items-center gap-3 ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <Search className="w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value.toUpperCase())}
          placeholder={isAr ? 'ابحث برمز القطعة، الاسم، الماركة، أو الموتو المتوافقة...' : 'Rechercher par code article, désignation, marque, moto compatible ou code-barres...'}
          className={`w-full text-xs font-bold outline-none bg-transparent uppercase ${
            isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
          }`}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Products Table */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`font-bold uppercase border-b ${
              isDark ? 'bg-slate-800/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              <tr>
                <th className="px-3 py-3 text-center w-8">#</th>
                <th className="px-4 py-3">{isAr ? 'الرمز' : 'Code Article'}</th>
                <th className="px-4 py-3">{isAr ? 'تعيين القطعة' : 'Désignation'}</th>
                <th className="px-4 py-3">{isAr ? 'الموقع' : 'Emplacement'}</th>
                <th className="px-4 py-3">{isAr ? 'الصنف والماركة' : 'Catégorie & Marque'}</th>
                <th className="px-4 py-3">{isAr ? 'اللون' : 'Couleur'}</th>
                <th className="px-4 py-3 text-right">{isAr ? 'سعر الشراء' : 'Prix Achat'}</th>
                <th className="px-4 py-3 text-right">{isAr ? 'التجزئة' : 'Détail'}</th>
                <th className="px-4 py-3 text-right">{isAr ? 'نصف الجملة' : 'Semi-Gros'}</th>
                <th className="px-4 py-3 text-right">{isAr ? 'الجملة' : 'Gros'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'المخزون' : 'Quantité'}</th>
                {hasPermission('produits', 'edit') && <th className="px-4 py-3 text-center">{isAr ? 'تعديل' : 'Modifier'}</th>}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
              {products.map((p, idx) => {
                const stockQty = p.stock?.find(s => s.storeId === (currentStore?.id || 1))?.quantity || 0;
                const productLocation = (p as any).location || '';
                const compatModels = (p as any).compatibleModels || [];
                const hasPhoto = !!(p as any).photo_base64;

                return (
                  <tr 
                    key={p.id} 
                    className={isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}
                  >
                    <td className="px-3 py-3 text-center text-slate-500 font-mono text-[11px] w-8">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-400 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {hasPhoto && (
                          <img 
                            src={(p as any).photo_base64} 
                            alt="" 
                            className="w-7 h-7 rounded-lg object-cover border border-slate-700 shrink-0" 
                          />
                        )}
                        <span>{p.code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.name}</div>
                      
                      {/* Sub-line: Barcodes + Moto compat count with 2-second hover tooltip */}
                      <div className="flex items-center gap-2 mt-0.5">
                        {compatModels.length > 0 && (
                          <button
                            type="button"
                            onMouseEnter={(e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setTooltipPos({ x: rect.left, y: rect.top });
                              hoverRowTimer.current = setTimeout(() => setHoveredProductRow(p), 2000);
                            }}
                            onMouseLeave={() => {
                              if (hoverRowTimer.current) clearTimeout(hoverRowTimer.current);
                              setHoveredProductRow(null);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 cursor-help"
                            title={isAr ? 'اضغط مطولاً لرؤية الموتوات المتوافقة' : 'Maintenir 2s pour voir les motos compatibles'}
                          >
                            <Wrench className="w-2.5 h-2.5" />
                            <span>{compatModels.length} moto(s)</span>
                          </button>
                        )}

                        {p.barcodes && p.barcodes.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.barcodes.map(b => b.barcodeValue).join(' | ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {productLocation ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono font-black text-[11px] border ${
                          isDark ? 'bg-amber-950/50 text-amber-300 border-amber-800/50' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {productLocation}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {p.categoryName || '-'} • <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{p.brandName || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                        {COLOR_MODE_LABELS[p.colorMode]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">{formatDZD(p.priceAchat)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatDZD(p.priceDetail)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{formatDZD(p.priceSemiGros)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{formatDZD(p.priceGros)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                        stockQty <= 5 
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {stockQty}
                      </span>
                    </td>
                    {hasPermission('produits', 'edit') && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openEditModal(p)}
                          title={isAr ? 'تعديل المنتج' : 'Modifier le produit'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-blue-500/10' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          <Pen className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Moto Compatibility Tooltip Card (shown after 2s hold) */}
      {hoveredProductRow && (() => {
        const compat = (hoveredProductRow as any).compatibleModels || [];
        return (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: Math.min(tooltipPos.x, window.innerWidth - 300), top: Math.max(tooltipPos.y - 120, 20) }}
          >
            <div className="bg-slate-900/98 border border-blue-500/50 backdrop-blur-md rounded-2xl p-4 w-72 shadow-2xl shadow-blue-900/40 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
                <Bike className="w-4 h-4 text-blue-400" />
                <p className="text-white font-bold text-xs line-clamp-1">{hoveredProductRow.name}</p>
              </div>
              <p className="text-[10px] text-blue-400 font-bold uppercase mb-2">
                {isAr ? `متوافق مع ${compat.length} طراز:` : `Modèles compatibles (${compat.length}):`}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {compat.map((m: any) => (
                  <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-950/60 text-blue-300 border border-blue-800/50">
                    <Bike className="w-2.5 h-2.5" />
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Add/Edit Product */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <h3 className={`text-base font-black flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <PackagePlus className="w-5 h-5 text-blue-500" />
                <span>{editingProduct 
                  ? (isAr ? `تعديل: ${editingProduct.code}` : `Modifier — ${editingProduct.code}`)
                  : (isAr ? 'إضافة منتج / قطعة جديدة' : 'Nouveau Produit / Article')
                }</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className={`p-1 rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-6">
              {/* Section 1: General Info */}
              <div className={`space-y-3 p-4 rounded-2xl border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  1. {isAr ? 'المعلومات الأساسية والأسعار' : 'Informations Générales & Tarification (DZD)'}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'كود المقال (أدخله يدوياً أو اتركه فارغاً لتوليده)' : 'Code Article (Manuel ou vide pour auto)'}
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: FLT-001, ART-0005..."
                      value={customCode}
                      onChange={e => setCustomCode(e.target.value.toUpperCase())}
                      disabled={!!editingProduct}
                      className={`w-full mt-1 border rounded-xl px-3.5 py-2 text-xs font-mono font-bold outline-none uppercase ${
                        editingProduct ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        isDark ? 'bg-slate-800 border-slate-700 text-blue-400 placeholder-slate-500' : 'bg-white border-slate-300 text-blue-700 placeholder-slate-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'تعيين القطعة *' : 'Désignation de la pièce *'}
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder={isAr ? 'مثال: بوجي إيريديوم CR8EIX' : 'Ex: BOUGIE ALLUMAGE IRIDIUM CR8EIX'}
                      value={name}
                      onChange={e => setName(e.target.value.toUpperCase())}
                      className={`w-full mt-1 border rounded-xl px-3.5 py-2 text-xs font-bold outline-none uppercase ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'الصنف' : 'Catégorie'}
                    </label>
                    <select
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : '')}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="">{isAr ? '-- اختر الصنف --' : '-- Choisir --'}</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'الماركة' : 'Marque / Fabricant'}
                    </label>
                    <select
                      value={brandId}
                      onChange={e => setBrandId(e.target.value ? parseInt(e.target.value, 10) : '')}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="">{isAr ? '-- اختر الماركة --' : '-- Choisir --'}</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'الموقع في المخزن (اختر أو اكتب جديد)' : 'Emplacement Rayon (ex: A-06, L-08)'}
                    </label>
                    <input
                      type="text"
                      list="locations-list"
                      placeholder="A-06"
                      value={location}
                      onChange={e => setLocation(e.target.value.toUpperCase())}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none uppercase ${
                        isDark ? 'bg-slate-800 border-slate-700 text-amber-300 placeholder-slate-500' : 'bg-white border-slate-300 text-amber-700 placeholder-slate-400'
                      }`}
                    />
                    <datalist id="locations-list">
                      {locations.map(loc => <option key={loc} value={loc} />)}
                    </datalist>
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'سعر الشراء (دج)' : 'Prix d\'Achat (DA)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceAchat}
                      onChange={e => setPriceAchat(e.target.value)}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'سعر التجزئة (دج) *' : 'Prix Détail (DA) *'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={priceDetail}
                      onChange={e => setPriceDetail(e.target.value)}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-500 outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'سعر نصف الجملة (دج) — يتبع التجزئة إذا فارغ' : 'Prix Semi-Gros (DA) — Suit détail si vide'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={priceDetail || "0.00"}
                      value={priceSemiGros}
                      onChange={e => setPriceSemiGros(e.target.value)}
                      onBlur={e => { if (!e.target.value || parseFloat(e.target.value) === 0) setPriceSemiGros(priceDetail); }}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-mono outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {isAr ? 'سعر الجملة (دج) — يتبع التجزئة إذا فارغ' : 'Prix Gros (DA) — Suit détail si vide'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={priceDetail || "0.00"}
                      value={priceGros}
                      onChange={e => setPriceGros(e.target.value)}
                      onBlur={e => { if (!e.target.value || parseFloat(e.target.value) === 0) setPriceGros(priceDetail); }}
                      className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-mono outline-none ${
                        isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Section: Photo Upload */}
              <div className={`space-y-3 p-4 rounded-2xl border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  <Camera className="w-3.5 h-3.5 text-blue-400" /> {isAr ? 'صورة المنتج' : 'Photo du Produit'}
                </h4>
                <div className="flex items-center gap-4">
                  {photoBase64 ? (
                    <div className="relative">
                      <img src={photoBase64} alt="Preview" className="w-20 h-20 rounded-xl object-cover border border-slate-700 shadow-md" />
                      <button 
                        type="button" 
                        onClick={() => setPhotoBase64('')}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                      isDark ? 'border-slate-700 hover:border-blue-500 text-slate-500 hover:text-blue-400' : 'border-slate-300 hover:border-blue-500 text-slate-400 hover:text-blue-600'
                    }`}>
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[9px] font-bold text-center">Ajouter</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  )}
                  <p className="text-[11px] text-slate-400">
                    {isAr ? 'اختر صورة من جهازك (JPG/PNG، أقصى حد 2 ميغا)' : 'Image JPG/PNG affichée dans le catalogue (max 2 Mo)'}
                  </p>
                </div>
              </div>

              {/* Section 2: Barcodes */}
              <div className={`space-y-3 p-4 rounded-2xl border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    <Barcode className="w-3.5 h-3.5 text-blue-500" /> 2. {isAr ? 'الرموز الشريطية (حد أقصى 5)' : 'Codes-barres (Max 5)'}
                  </h4>
                  <button
                    type="button"
                    onClick={handleGenerateAutoBarcode}
                    className="px-3 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-bold rounded-lg text-xs"
                  >
                    + {isAr ? 'توليد كود تلقائي' : 'Générer Code128'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={isAr ? 'أدخل الرمز الشريطي يدوياً أو بواسطة القارئ...' : 'Saisir ou scanner code-barres...'}
                    value={manualBarcode}
                    onChange={e => setManualBarcode(e.target.value)}
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none ${
                      isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddManualBarcode}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs"
                  >
                    {isAr ? 'إضافة' : 'Ajouter'}
                  </button>
                </div>

                {barcodesList.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {barcodesList.map(bc => (
                      <span
                        key={bc}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 border rounded-lg font-mono text-xs font-bold ${
                          isDark ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-white border-slate-300 text-blue-600'
                        }`}
                      >
                        <Barcode className="w-3.5 h-3.5" />
                        <span>{bc}</span>
                        <button type="button" onClick={() => handleRemoveBarcode(bc)} className="text-rose-400 hover:text-rose-300 ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 3: Colors (Conditional: only for Carénage, Accessoires, etc.) */}
              {shouldShowColors && (
                <div className={`space-y-3 p-4 rounded-2xl border ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      <Palette className="w-3.5 h-3.5 text-purple-500" /> 3. {isAr ? 'نظام إدارة الألوان' : 'Gestion des Couleurs'}
                    </h4>

                    <button
                      type="button"
                      onClick={() => setShowAddColorForm(!showAddColorForm)}
                      className="flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{showAddColorForm ? 'Fermer' : 'Ajouter Nouvelle Couleur'}</span>
                    </button>
                  </div>

                  {/* Inline Add Color Form */}
                  {showAddColorForm && (
                    <div className={`p-3 rounded-xl border flex items-center gap-2 ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}>
                      <input
                        type="text"
                        placeholder="Nom couleur (ex: BLEU NUIT)"
                        value={newColorName}
                        onChange={e => setNewColorName(e.target.value.toUpperCase())}
                        className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none uppercase ${
                          isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                      <input
                        type="color"
                        value={newColorHex}
                        onChange={e => setNewColorHex(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewColor}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg"
                      >
                        Sauvegarder
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {COLOR_MODES.map(mode => (
                      <label
                        key={mode}
                        onClick={() => setColorMode(mode)}
                        className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          colorMode === mode
                            ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                            : isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-300 text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input type="radio" checked={colorMode === mode} onChange={() => setColorMode(mode)} />
                          {COLOR_MODE_LABELS[mode]}
                        </span>
                      </label>
                    ))}
                  </div>

                  {colorMode === 'single' && (
                    <div>
                      <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {isAr ? 'اختر اللون :' : 'Choisir la couleur :'}
                      </label>
                      <select
                        value={selectedColorId}
                        onChange={e => setSelectedColorId(e.target.value ? parseInt(e.target.value, 10) : '')}
                        className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none ${
                          isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="">{isAr ? '-- اختر لوناً --' : '-- Sélectionner une couleur --'} ({colors.length} disponibles)</option>
                        {colors.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(colorMode === 'variants' || colorMode === 'merged') && (
                    <div className="space-y-2">
                      <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {colorMode === 'variants'
                          ? (isAr ? 'اختر خيارات الألوان المتوفرة :' : 'Sélectionner les déclinaisons de couleurs :')
                          : (isAr ? 'اختر الألوان المدمجة في نفس القطعة :' : 'Sélectionner les couleurs composant l\'article :')}
                      </label>
                      <div className={`max-h-36 overflow-y-auto grid grid-cols-3 gap-1.5 p-2 rounded-xl border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                      }`}>
                        {colors.map(c => {
                          const isChecked = colorMode === 'variants' ? variantColorIds.includes(c.id) : mergeColorIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-blue-500/10">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  if (colorMode === 'variants') {
                                    if (e.target.checked) setVariantColorIds([...variantColorIds, c.id]);
                                    else setVariantColorIds(variantColorIds.filter(id => id !== c.id));
                                  } else {
                                    if (e.target.checked) setMergeColorIds([...mergeColorIds, c.id]);
                                    else setMergeColorIds(mergeColorIds.filter(id => id !== c.id));
                                  }
                                }}
                              />
                              <div className="w-2.5 h-2.5 rounded-full border border-slate-600 shrink-0" style={{ backgroundColor: c.hexCode }} />
                              <span className="truncate text-[11px]">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 4: Motos & Scooters Compatibles */}
              <div className={`space-y-3 p-4 rounded-2xl border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    <Wrench className="w-3.5 h-3.5 text-blue-500" /> 4. {isAr ? 'الدراجات والموتوات المتوافقة' : 'Compatibilité Motos & Scooters'}
                  </h4>
                  <span className="text-[11px] font-bold text-blue-400">
                    {compatibleMotos.length} sélectionnée(s)
                  </span>
                </div>

                <input
                  type="text"
                  placeholder={isAr ? 'تصفية الطرازات (CG125, SYM, VMS, YBR...)' : 'Filtrer les modèles (CG125, SYM, VMS, YBR, Fox...)'}
                  value={motoSearchFilter}
                  onChange={e => setMotoSearchFilter(e.target.value.toUpperCase())}
                  className={`w-full border rounded-xl px-3 py-1.5 text-xs font-medium outline-none uppercase ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />

                <div className={`max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2 rounded-xl border ${
                  isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                }`}>
                  {filteredMotos.map(m => {
                    const isChecked = compatibleMotos.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 rounded hover:bg-blue-500/10">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) setCompatibleMotos([...compatibleMotos, m.id]);
                            else setCompatibleMotos(compatibleMotos.filter(id => id !== m.id));
                          }}
                        />
                        <span className={`truncate text-[11px] ${isChecked ? 'font-bold text-blue-400' : ''}`}>{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Section 5: Initial Stock */}
              <div className={`space-y-3 p-4 rounded-2xl border ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  5. {isAr ? 'المخزون الأولي' : 'Stock Initial'}
                </h4>
                <div className="max-w-xs">
                  <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {isAr ? 'الكمية الأولية في المحل' : 'Quantité initiale en stock'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={initialStockStore1}
                    onChange={e => setInitialStockStore1(e.target.value)}
                    className={`w-full mt-1 border rounded-xl px-3 py-2 text-xs font-bold text-center text-emerald-500 outline-none ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className={`flex items-center justify-end gap-3 pt-3 border-t ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30"
                >
                  {isAr ? 'حفظ القطعة' : 'Enregistrer le Produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Proforma Generator */}
      {showProformaModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <h3 className={`text-base font-black flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <FileText className="w-5 h-5 text-emerald-500" />
                <span>{isAr ? 'إنشاء فاتورة شكلية (Devis Proforma)' : 'Générateur de Facture Proforma'}</span>
              </h3>
              <button 
                onClick={() => setShowProformaModal(false)} 
                className={`p-1 rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAr ? 'اسم العميل / المؤسسة' : 'Nom du Client / Entreprise'}
              </label>
              <input
                type="text"
                value={proformaClientName}
                onChange={e => setProformaClientName(e.target.value.toUpperCase())}
                placeholder="Ex: SARL MOTO EXPRESS ALGER"
                className={`w-full mt-1.5 border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none uppercase ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>

            <div className={`border rounded-2xl p-3 max-h-48 overflow-y-auto space-y-2 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                {isAr ? 'اختر مقالات لإضافتها للتقدير :' : 'Ajouter des articles au Devis :'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {products.slice(0, 8).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const exist = proformaItems.find(i => i.product.id === p.id);
                      if (exist) {
                        setProformaItems(proformaItems.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i));
                      } else {
                        setProformaItems([...proformaItems, { product: p, qty: 1, price: p.priceDetail }]);
                      }
                    }}
                    className={`p-2 rounded-xl border text-left text-xs transition-all ${
                      isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-750' : 'bg-white border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="text-[10px] text-emerald-500 font-mono font-bold">{formatDZD(p.priceDetail)}</div>
                  </button>
                ))}
              </div>
            </div>

            {proformaItems.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400">Articles sélectionnés ({proformaItems.length})</span>
                <div className="space-y-1">
                  {proformaItems.map((item, idx) => (
                    <div key={idx} className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                    }`}>
                      <span className="font-bold truncate max-w-[200px]">{item.product.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold">{item.qty} x {formatDZD(item.price)}</span>
                        <button
                          type="button"
                          onClick={() => setProformaItems(proformaItems.filter((_, i) => i !== idx))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`flex items-center justify-end gap-3 pt-3 border-t ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setShowProformaModal(false)}
                className={`px-4 py-2 text-xs font-bold rounded-xl ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={generateProformaPDF}
                disabled={proformaItems.length === 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/30 flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Télécharger Devis PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
