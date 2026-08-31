import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore, CartItem } from '../store/useStore';
import { invokeIpc } from '../api/electronBridge';
import { runFullSync } from '../api/syncEngine';
import { Product, Client, PriceTier, PaymentMethod } from '@gestion-veloo/shared';
import { formatDZD } from '@gestion-veloo/shared';
import { PRICE_TIER_LABELS } from '@gestion-veloo/shared';
import { 
  Search, 
  ScanBarcode, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Printer, 
  RotateCcw, 
  UserCheck, 
  DollarSign, 
  CheckCircle2, 
  Tag, 
  Sparkles, 
  X,
  Lock,
  User,
  ShoppingBag,
  Bike
} from 'lucide-react';

export const POSPage: React.FC = () => {
  const { 
    currentStore, 
    currentUser, 
    cart, 
    addToCart, 
    updateCartQty, 
    updateCartPrice, 
    updateCartTier, 
    removeFromCart, 
    clearCart,
    selectedClient,
    setSelectedClient,
    hasPermission,
    lang
  } = useStore();

  const isAr = lang === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('');
  const [selectedColor, setSelectedColor] = useState<number | ''>('');
  const [sortAz, setSortAz] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [colors, setColors] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Checkout State
  const [paymentType, setPaymentType] = useState<PaymentMethod>('cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [discountInput, setDiscountInput] = useState<string>('0');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastReceiptText, setLastReceiptText] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Return Flow State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [pastSales, setPastSales] = useState<any[]>([]);
  const [selectedPastSale, setSelectedPastSale] = useState<any | null>(null);
  const [returnItemsState, setReturnItemsState] = useState<Record<number, number>>({});

  // Hover Tooltip (2s delay — shows compatible motos in red card)
  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Barcode HID Keystroke Buffer Listener
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await invokeIpc<Product[]>('get-products', {
        q: searchQuery,
        categoryId: selectedCategory ? Number(selectedCategory) : undefined,
        colorId: selectedColor ? Number(selectedColor) : undefined,
        storeId: currentStore?.id,
        sort: sortAz ? 'az' : undefined
      });
      setProducts(res || []);
    } catch (err) {
      console.error('Products load error:', err);
    }
  }, [searchQuery, selectedCategory, selectedColor, sortAz, currentStore]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    invokeIpc<any>('get-metadata').then(res => {
      if (res) {
        setCategories(res.categories || []);
        setColors(res.colors || []);
      }
    });
    invokeIpc<Client[]>('get-clients').then(setClients);
  }, []);

  // Global Barcode Scanner HID listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      if (timeDiff > 50) {
        barcodeBuffer.current = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 4) {
          e.preventDefault();
          const scanned = barcodeBuffer.current.trim();
          handleBarcodeScanned(scanned);
          barcodeBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  const handleBarcodeScanned = (codeValue: string) => {
    const found = products.find(p => 
      p.code.toLowerCase() === codeValue.toLowerCase() ||
      p.barcodes?.some(b => b.barcodeValue.toLowerCase() === codeValue.toLowerCase())
    );

    if (found) {
      addToCart(found, 'detail');
      setSearchQuery('');
    } else {
      setSearchQuery(codeValue);
    }
  };

  // Cart calculations
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountCentimes = Math.round((parseFloat(discountInput) || 0) * 100);
  const total = Math.max(0, subtotal - discountCentimes);
  const amountPaidCentimes = Math.round((parseFloat(amountPaidInput) || 0) * 100);
  const changeDue = Math.max(0, amountPaidCentimes - total);

  // Complete Sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);

    try {
      const salePayload = {
        storeId: currentStore?.id || 1,
        clientId: selectedClient ? selectedClient.id : null,
        userId: currentUser?.id || 1,
        discount: discountCentimes,
        amountPaid: paymentType === 'credit' ? 0 : (paymentType === 'mixed' ? amountPaidCentimes : total),
        paymentType,
        items: cart.map(it => ({
          productId: it.product.id,
          productColorId: it.productColorId || null,
          priceTier: it.priceTier,
          qty: it.qty,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal
        }))
      };

      const saleResult = await invokeIpc<any>('create-sale', salePayload);
      const settings = await invokeIpc<any>('get-settings', currentStore?.id || 1);

      const printRes = await invokeIpc<any>('print-receipt', {
        sale: {
          id: saleResult.saleId,
          total,
          subtotal,
          discount: discountCentimes,
          amountPaid: salePayload.amountPaid,
          amountCredit: saleResult.amountCredit || 0,
          paymentType,
          items: cart.map(it => ({
            ...it,
            product: it.product
          })),
          client: selectedClient || undefined
        },
        store: currentStore,
        settings: settings || { storeName: currentStore?.name, address: currentStore?.address, phone: currentStore?.phone },
        cashierName: currentUser?.fullName || currentUser?.username || 'Caissier'
      });

      setLastReceiptText(printRes.receiptText || '');
      setShowCheckoutModal(false);
      setShowReceiptModal(true);
      clearCart();
      loadProducts();

      // Automatically push sale to Cloud server in background
      runFullSync(currentStore?.id || 1).catch(e => console.warn('Auto-sync notice:', e));
    } catch (err: any) {
      alert(`Erreur de validation de vente : ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Open Return flow
  const handleOpenReturns = async () => {
    try {
      const res = await invokeIpc<any[]>('get-sales', { storeId: currentStore?.id });
      setPastSales(res || []);
      setSelectedPastSale(null);
      setReturnItemsState({});
      setShowReturnModal(true);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleSelectPastSale = (sale: any) => {
    setSelectedPastSale(sale);
    const initialReturns: Record<number, number> = {};
    if (sale.items) {
      sale.items.forEach((it: any) => {
        initialReturns[it.id] = 0;
      });
    }
    setReturnItemsState(initialReturns);
  };

  const handleConfirmReturn = async () => {
    if (!selectedPastSale) return;
    const itemsToReturn = Object.entries(returnItemsState)
      .map(([saleItemId, qty]) => {
        const saleItem = selectedPastSale.items.find((it: any) => it.id === parseInt(saleItemId, 10));
        const uPrice = saleItem?.unit_price || saleItem?.unitPrice || 0;
        return {
          saleItemId: parseInt(saleItemId, 10),
          qtyReturned: qty,
          unitPrice: uPrice,
          lineTotal: qty * uPrice
        };
      })
      .filter(it => it.qtyReturned > 0);

    if (itemsToReturn.length === 0) {
      alert(isAr ? 'يرجى تحديد قطعة واحدة على الأقل للإرجاع.' : 'Veuillez sélectionner au moins un article à retourner.');
      return;
    }

    try {
      await invokeIpc('process-return', {
        saleId: selectedPastSale.id,
        storeId: currentStore?.id || 1,
        userId: currentUser?.id || 1,
        items: itemsToReturn
      });

      alert(isAr ? 'تم تأكيد الإرجاع بنجاح وتحديث المخزون (رمز 92)!' : 'Retour validé avec succès et stock réintégré (Code 92) !');
      setShowReturnModal(false);
      loadProducts();
    } catch (err: any) {
      alert(`Erreur lors du retour : ${err.message}`);
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Column: Product Search & Catalog Grid */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800 bg-slate-950">
        {/* Search & Quick Filters Bar */}
        <div className="p-4 border-b border-slate-800 space-y-3 shrink-0 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'امسح بالباركود أو اكتب المرجع، الاسم، الماركة...' : 'Scanner code-barres ou taper réf, désignation, marque, modèle moto...'}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-medium text-white focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-3 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={handleOpenReturns}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isAr ? 'إرجاع سلعة (92)' : 'Retour Article'}</span>
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="border border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-800 text-slate-200 font-medium outline-none"
            >
              <option value="">{isAr ? 'كل الأصناف' : 'Toutes Catégories'}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              value={selectedColor}
              onChange={e => setSelectedColor(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="border border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-800 text-slate-200 font-medium outline-none"
            >
              <option value="">{isAr ? 'كل الألوان' : 'Toutes Couleurs'}</option>
              {colors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <button
              onClick={() => setSortAz(!sortAz)}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                sortAz ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {isAr ? 'ترتيب أ-ي' : 'Tri A→Z'}
            </button>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 content-start relative">
          {products.map(p => {
            const stockQty = p.stock?.find(s => s.storeId === currentStore?.id)?.quantity || 0;
            const isOutOfStock = stockQty <= 0;
            const productLocation = (p as any).location || '';
            const compatModels = (p as any).compatibleModels || [];

            return (
              <div
                key={p.id}
                onClick={() => !isOutOfStock && addToCart(p, 'detail')}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTooltipPos({ x: rect.left, y: rect.top });
                  hoverTimerRef.current = setTimeout(() => setHoveredProduct(p), 2000);
                }}
                onMouseLeave={() => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  setHoveredProduct(null);
                }}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between select-none ${
                  isOutOfStock
                    ? 'bg-slate-900/40 border-slate-800 opacity-50 cursor-not-allowed'
                    : 'bg-slate-900 border-slate-800 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer active:scale-[0.98]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-[11px] font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-md border border-blue-500/30">
                      {p.code}
                    </span>
                    {stockQty <= 0 ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-600 text-white animate-pulse">
                        {isAr ? '🚨 نفاد المخزون' : '🚨 RUPTURE'}
                      </span>
                    ) : stockQty <= 5 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ⚠️ {stockQty} {isAr ? 'متبقي' : 'restant(s)'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
                        {stockQty} {isAr ? 'متوفر' : 'en stock'}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-white text-xs mt-2 line-clamp-2 leading-snug">
                    {p.name}
                  </h3>

                  <p className="text-[10px] text-slate-400 mt-1">
                    {p.brandName || p.categoryName || 'Accessoire'}
                    {productLocation && (
                      <span className="ml-2 font-mono font-black text-amber-400">{productLocation}</span>
                    )}
                  </p>

                  {p.colors && p.colors.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {p.colors.map(c => (
                        <div
                          key={c.id}
                          title={c.name}
                          className="w-3 h-3 rounded-full border border-slate-700 shadow-sm"
                          style={{ backgroundColor: c.hexCode }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Compatible Motorcycles Badges */}
                  {compatModels.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 overflow-hidden">
                      <Bike className="w-3 h-3 text-blue-400 shrink-0" />
                      <span className="text-[10px] text-blue-400 font-bold truncate">
                        {compatModels.map((m: any) => m.name).join(', ')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">{isAr ? 'تجزئة' : 'Détail'}</span>
                  <span className="text-xs font-black text-emerald-400">{formatDZD(p.priceDetail)}</span>
                </div>
              </div>
            );
          })}

          {/* Hover Tooltip — Red Moto Info Card (appears after 2s hover) */}
          {hoveredProduct && (() => {
            const compat = (hoveredProduct as any).compatibleModels || [];
            const loc = (hoveredProduct as any).location || '';
            return (
              <div
                className="fixed z-[9999] pointer-events-none"
                style={{ left: Math.min(tooltipPos.x, window.innerWidth - 280), top: Math.max(tooltipPos.y - 20, 10) }}
              >
                <div className="bg-rose-950/95 border border-rose-700/80 backdrop-blur-md rounded-2xl p-4 w-64 shadow-2xl shadow-rose-900/50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-rose-800/50">
                    <div className="w-6 h-6 rounded-full bg-rose-600 flex items-center justify-center">
                      <Bike className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-rose-200 font-black text-[11px] line-clamp-1">{hoveredProduct.name}</p>
                      <p className="text-rose-400 font-mono text-[10px]">{hoveredProduct.code}</p>
                    </div>
                  </div>
                  {loc && (
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-rose-400 font-bold uppercase">{isAr ? 'موقع:' : 'Emplacement:'}</span>
                      <span className="font-mono font-black text-amber-300 text-xs">{loc}</span>
                    </div>
                  )}
                  {compat.length > 0 ? (
                    <>
                      <p className="text-[10px] text-rose-400 font-bold uppercase mb-2">
                        {isAr ? `متوافق مع ${compat.length} طراز موتو:` : `Compatible ${compat.length} moto(s):`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {compat.map((m: any) => (
                          <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-900/60 text-rose-200 border border-rose-700/50">
                            <Bike className="w-2.5 h-2.5" />
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-rose-500 italic">
                      {isAr ? 'لا توجد موتوات متوافقة محددة' : 'Aucun modèle moto spécifié'}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Right Column: POS Cart & Checkout Panel */}
      <div className="w-96 flex flex-col bg-slate-900 shrink-0 border-l border-slate-800">
        {/* Client Selection header */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-850 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>{isAr ? 'الزبيل المحدد' : 'Client Associé'}</span>
            </span>
            {selectedClient && (
              <button onClick={() => setSelectedClient(null)} className="text-[11px] text-slate-400 hover:text-rose-400">
                {isAr ? 'إلغاء' : 'Désélectionner'}
              </button>
            )}
          </div>

          <select
            value={selectedClient?.id || ''}
            onChange={e => {
              const c = clients.find(cl => cl.id === parseInt(e.target.value, 10));
              setSelectedClient(c || null);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
          >
            <option value="">{isAr ? '-- زبون عابر (Comptoir) --' : '-- Client Comptoir (Passage) --'}</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.isFidele ? '⭐ (Fidèle)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Cart items list */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <ShoppingBag className="w-10 h-10 stroke-1 text-slate-600" />
              <p className="text-xs font-medium">{isAr ? 'السلة فارغة. انقر على أي قطعة أو امسح الباركود.' : 'Panier vide. Cliquez sur un article ou scannez un code-barres.'}</p>
            </div>
          ) : (
            cart.map(it => (
              <div key={`${it.product.id}-${it.productColorId}-${it.priceTier}`} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-xs leading-tight">{it.product.name}</h4>
                    <span className="font-mono text-[10px] text-blue-400">{it.product.code}</span>
                  </div>
                  <button
                    onClick={() => removeFromCart(it.product.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Price tier selector */}
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {(['detail', 'semi_gros', 'gros'] as PriceTier[]).map(tier => (
                    <button
                      key={tier}
                      onClick={() => updateCartTier(it.product.id, tier)}
                      className={`py-1 rounded-lg font-bold border transition-all ${
                        it.priceTier === tier
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {PRICE_TIER_LABELS[tier]}
                    </button>
                  ))}
                </div>

                {/* Qty & Price controls */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                  <div className="flex items-center gap-1.5 bg-slate-900 rounded-xl p-1 border border-slate-800">
                    <button
                      onClick={() => updateCartQty(it.product.id, it.qty - 1)}
                      className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center font-bold text-xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center font-mono font-bold text-xs text-white">{it.qty}</span>
                    <button
                      onClick={() => updateCartQty(it.product.id, it.qty + 1)}
                      className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center font-bold text-xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-mono font-black text-sm text-emerald-400">{formatDZD(it.lineTotal)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Total & Checkout Button */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>{isAr ? 'المجموع الفرعي :' : 'Sous-Total :'}</span>
              <span className="font-mono font-bold text-white">{formatDZD(subtotal)}</span>
            </div>
            <div className="flex justify-between font-black text-sm text-white pt-1 border-t border-slate-800">
              <span>{isAr ? 'الإجمالي العام :' : 'Total à Payer :'}</span>
              <span className="font-mono text-base text-emerald-400">{formatDZD(total)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="px-3 py-3 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-400 hover:text-white rounded-xl text-xs font-bold"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setPaymentType('cash');
                setAmountPaidInput((total / 100).toString());
                setShowCheckoutModal(true);
              }}
              disabled={cart.length === 0}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isAr ? 'دفع وحفظ الفاتورة' : 'Encaisser & Imprimer (F10)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Payment / Checkout */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'تأكيد الدفع وطباعة التذكرة' : 'Encaissement & Impression'}</span>
              </h3>
              <button onClick={() => setShowCheckoutModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total due display */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center">
              <div className="text-xs text-slate-400 font-semibold">{isAr ? 'المبلغ الإجمالي المستحق' : 'Montant Total Net'}</div>
              <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{formatDZD(total)}</div>
            </div>

            {/* Payment methods */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'طريقة الدفع' : 'Mode de Règlement'}</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(['cash', 'credit', 'mixed'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentType(m)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      paymentType === m
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {m === 'cash' ? (isAr ? 'نقداً' : 'Espèces') : m === 'credit' ? (isAr ? 'آجل' : 'Crédit') : (isAr ? 'مختلط' : 'Mixte')}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Input */}
            {paymentType !== 'credit' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">{isAr ? 'المبلغ المستلم من الزبون (دج)' : 'Montant Encaissé (DA)'}</label>
                <input
                  type="number"
                  placeholder={paymentType === 'cash' ? (total / 100).toString() : '0'}
                  value={amountPaidInput}
                  onChange={e => setAmountPaidInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-black text-emerald-400 outline-none text-center"
                />
                {changeDue > 0 && (
                  <div className="p-2 bg-blue-950/40 border border-blue-800/40 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-blue-300 font-bold">{isAr ? 'الصرف المتبقي للزبون :' : 'Monnaie à rendre :'}</span>
                    <span className="font-mono font-black text-blue-400">{formatDZD(changeDue)}</span>
                  </div>
                )}
              </div>
            )}

            {paymentType === 'credit' && !selectedClient && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 font-semibold">
                ⚠️ {isAr ? 'يرجى تحديد زبون قبل تأكيد البيع بالآجل.' : 'Veuillez sélectionner un client dans le panneau de droite avant de valider une vente à crédit.'}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
              >
                {isAr ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                type="button"
                disabled={checkoutLoading || (paymentType === 'credit' && !selectedClient)}
                onClick={handleCompleteSale}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{checkoutLoading ? (isAr ? 'جاري الطباعة...' : 'Impression...') : (isAr ? 'تأكيد وطباعة التذكرة' : 'Confirmer & Imprimer')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Thermal Receipt Preview */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <span>{isAr ? 'معاينة تذكرة الصندوق (80mm ESC/POS)' : 'Ticket Imprimé (80mm ESC/POS)'}</span>
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-2xl overflow-y-auto max-h-96 whitespace-pre border border-slate-800 shadow-inner">
              {lastReceiptText}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs"
              >
                {isAr ? 'إغلاق' : 'Fermer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Returns Flow */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">{isAr ? 'إرجاع السلع واسترداد المبالغ (رمز 92)' : 'Procédure de Retour d\'Articles (Code 92)'}</h3>
              </div>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!selectedPastSale ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 font-medium">{isAr ? 'اختر تذكرة البيع السابقة المراد إرجاعها :' : 'Sélectionnez la vente passée à rembourser :'}</p>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-2xl">
                  {pastSales.map(s => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectPastSale(s)}
                      className="p-3.5 hover:bg-slate-800/60 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">Ticket #{s.id} • {s.clientName || (isAr ? 'زبون عابر' : 'Client de passage')}</div>
                        <div className="text-slate-500 font-mono">{new Date(s.created_at || s.createdAt).toLocaleString('fr-DZ')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-400 font-mono">{formatDZD(s.total)}</div>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 uppercase font-semibold">{s.payment_type || s.paymentType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950 rounded-xl flex items-center justify-between text-xs border border-slate-800">
                  <div>
                    <span className="font-bold text-white">Ticket #{selectedPastSale.id}</span> • {selectedPastSale.clientName || 'Client'}
                  </div>
                  <button onClick={() => setSelectedPastSale(null)} className="text-blue-400 hover:underline font-semibold">
                    {isAr ? 'تغيير التذكرة' : 'Changer de vente'}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300 uppercase">{isAr ? 'القطع والكميات المراد إرجاعها :' : 'Articles & Quantités à Retourner :'}</div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-2xl p-2 bg-slate-950">
                    {selectedPastSale.items?.map((it: any) => (
                      <div key={it.id} className="py-2.5 px-2 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-white">{it.productName}</div>
                          <div className="text-slate-500 text-[11px] font-mono">
                            {isAr ? 'المشترى :' : 'Acheté :'} {it.qty} | {isAr ? 'المؤهل للإرجاع :' : 'Reste éligible :'} {it.returnableQty}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-300 font-mono">{formatDZD(it.unit_price || it.unitPrice)}</span>
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => setReturnItemsState(prev => ({
                                ...prev,
                                [it.id]: Math.max(0, (prev[it.id] || 0) - 1)
                              }))}
                              className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-bold font-mono text-emerald-400">{returnItemsState[it.id] || 0}</span>
                            <button
                              type="button"
                              onClick={() => setReturnItemsState(prev => ({
                                ...prev,
                                [it.id]: Math.min(it.returnableQty, (prev[it.id] || 0) + 1)
                              }))}
                              className="w-5 h-5 bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowReturnModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl"
                  >
                    {isAr ? 'إلغاء' : 'Annuler'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReturn}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs shadow-md flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد الإرجاع وإعادة التخزين (92)' : 'Valider le Retour (Code 92)'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
