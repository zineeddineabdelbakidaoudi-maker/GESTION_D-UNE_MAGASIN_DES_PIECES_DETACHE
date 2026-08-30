import { create } from 'zustand';
import { User, Product, PriceTier, Client, Store, SystemModule } from '@gestion-veloo/shared';

export interface CartItem {
  product: Product;
  productColorId?: number | null;
  colorName?: string;
  qty: number;
  priceTier: PriceTier;
  unitPrice: number; // in centimes
  lineTotal: number; // in centimes
}

interface AppState {
  currentUser: User | null;
  currentStore: Store | null;
  activeTab: string;
  cart: CartItem[];
  selectedClient: Client | null;
  currentCashSessionId: number | null;
  capital: number;
  lang: 'fr' | 'ar';
  theme: 'dark' | 'light';

  setCurrentUser: (user: User | null) => void;
  setCurrentStore: (store: Store | null) => void;
  setActiveTab: (tab: string) => void;
  setCapital: (capital: number) => void;
  setLang: (lang: 'fr' | 'ar') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  // Cart actions
  addToCart: (product: Product, priceTier?: PriceTier, colorId?: number, colorName?: string) => void;
  updateCartQty: (productId: number, qty: number) => void;
  updateCartPrice: (productId: number, unitPrice: number) => void;
  updateCartTier: (productId: number, tier: PriceTier) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;

  setSelectedClient: (client: Client | null) => void;
  setCurrentCashSessionId: (id: number | null) => void;

  hasPermission: (module: SystemModule, action: 'view' | 'edit') => boolean;
}

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  currentStore: {
    id: 1,
    name: 'Boutique Centre-Ville (Store 1)',
    address: 'Rue Didouche Mourad, Alger',
    phone: '0550 11 22 33',
    createdAt: new Date().toISOString()
  },
  activeTab: 'pos',
  cart: [],
  selectedClient: null,
  currentCashSessionId: 1,
  capital: 38465000,
  lang: 'fr',
  theme: (localStorage.getItem('pos_theme') as 'dark' | 'light') || 'dark',

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentStore: (store) => set({ currentStore: store }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCapital: (capital) => set({ capital }),
  setLang: (lang) => set({ lang }),
  setTheme: (theme) => {
    localStorage.setItem('pos_theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('pos_theme', next);
    set({ theme: next });
  },

  addToCart: (product, tier = 'detail', colorId, colorName) => {
    const { cart } = get();
    let unitPrice = product.priceDetail;
    if (tier === 'semi_gros') unitPrice = product.priceSemiGros;
    if (tier === 'gros') unitPrice = product.priceGros;

    const existingIndex = cart.findIndex(
      it => it.product.id === product.id && it.productColorId === (colorId || null) && it.priceTier === tier
    );

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += 1;
      updated[existingIndex].lineTotal = updated[existingIndex].qty * updated[existingIndex].unitPrice;
      set({ cart: updated });
    } else {
      const newItem: CartItem = {
        product,
        productColorId: colorId || null,
        colorName,
        qty: 1,
        priceTier: tier,
        unitPrice,
        lineTotal: unitPrice
      };
      set({ cart: [newItem, ...cart] });
    }
  },

  updateCartQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeFromCart(productId);
      return;
    }
    const updated = get().cart.map(it => {
      if (it.product.id === productId) {
        return {
          ...it,
          qty,
          lineTotal: qty * it.unitPrice
        };
      }
      return it;
    });
    set({ cart: updated });
  },

  updateCartPrice: (productId, unitPrice) => {
    const updated = get().cart.map(it => {
      if (it.product.id === productId) {
        return {
          ...it,
          unitPrice,
          lineTotal: it.qty * unitPrice
        };
      }
      return it;
    });
    set({ cart: updated });
  },

  updateCartTier: (productId, tier) => {
    const updated = get().cart.map(it => {
      if (it.product.id === productId) {
        let unitPrice = it.product.priceDetail;
        if (tier === 'semi_gros') unitPrice = it.product.priceSemiGros;
        if (tier === 'gros') unitPrice = it.product.priceGros;
        return {
          ...it,
          priceTier: tier,
          unitPrice,
          lineTotal: it.qty * unitPrice
        };
      }
      return it;
    });
    set({ cart: updated });
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter(it => it.product.id !== productId) });
  },

  clearCart: () => set({ cart: [], selectedClient: null }),
  setSelectedClient: (client) => set({ selectedClient: client }),
  setCurrentCashSessionId: (id) => set({ currentCashSessionId: id }),

  hasPermission: (module, action) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    if (currentUser.role === 'owner') return true;
    const perm = currentUser.permissions?.find(p => p.module === module);
    if (!perm) return false;
    return action === 'view' ? Boolean(perm.canView) : Boolean(perm.canEdit);
  }
}));
