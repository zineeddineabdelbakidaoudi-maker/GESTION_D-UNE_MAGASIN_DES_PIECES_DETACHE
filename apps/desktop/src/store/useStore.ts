import { create } from 'zustand';
import { can, type PriceTier, type Store, type SystemModule } from '@gestion-veloo/shared';
import { invokeIpc } from '../api/electronBridge';
import type { Product, Client } from '@gestion-veloo/shared';

export interface SessionPermission {
  module: SystemModule;
  canView: boolean;
  canEdit: boolean;
}

export interface SessionUser {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  role: 'owner' | 'manager' | 'cashier' | 'auditor';
  storeId: number | null;
  isActive: boolean;
  permissions: SessionPermission[];
  mustChangePassword: boolean;
  startedAt: string;
}

export interface Capabilities {
  canSeeCost: boolean;
}

export interface CartItem {
  product: Product;
  productColorId?: number | null;
  colorName?: string;
  qty: number;
  priceTier: PriceTier;
  unitPrice: number; // centimes
  lineTotal: number; // centimes
}

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface AppState {
  currentUser: SessionUser | null;
  currentStore: Store | null;
  stores: Store[];
  capabilities: Capabilities;
  sessionChecked: boolean;

  activeTab: string;
  cart: CartItem[];
  selectedClient: Client | null;
  currentCashSessionId: number | null;
  capital: number;
  lang: 'fr' | 'ar';
  theme: 'dark' | 'light';
  toasts: Toast[];

  restoreSession: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  applySession: (payload: any) => void;

  setCurrentStore: (store: Store | null) => void;
  setActiveTab: (tab: string) => void;
  setCapital: (capital: number) => void;
  setLang: (lang: 'fr' | 'ar') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  notifyError: (err: unknown, fallbackTitle?: string) => void;

  addToCart: (product: Product, priceTier?: PriceTier, colorId?: number, colorName?: string) => void;
  updateCartQty: (productId: number, qty: number) => void;
  updateCartPrice: (productId: number, unitPrice: number) => void;
  updateCartTier: (productId: number, tier: PriceTier) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;

  setSelectedClient: (client: Client | null) => void;
  setCurrentCashSessionId: (id: number | null) => void;

  hasPermission: (module: SystemModule, action: 'view' | 'edit') => boolean;
  /** Premier onglet auquel l'utilisateur a réellement accès. */
  defaultTab: () => string;
}

const TAB_MODULES: Array<{ tab: string; module: SystemModule }> = [
  { tab: 'pos', module: 'pos' },
  { tab: 'produits', module: 'produits' },
  { tab: 'stock', module: 'stock' },
  { tab: 'achat', module: 'achat' },
  { tab: 'clients', module: 'clients' },
  { tab: 'fournisseurs', module: 'fournisseurs' },
  { tab: 'rapport', module: 'rapport' },
  { tab: 'depenses', module: 'depenses' },
  { tab: 'zakat', module: 'zakat' },
  { tab: 'journal', module: 'journal' },
  { tab: 'utilisateurs', module: 'users' },
  { tab: 'settings', module: 'settings' }
];

let toastSeq = 0;

export const useStore = create<AppState>((set, get) => ({
  currentUser: null,
  currentStore: null,
  stores: [],
  capabilities: { canSeeCost: false },
  sessionChecked: false,

  activeTab: 'pos',
  cart: [],
  selectedClient: null,
  currentCashSessionId: null,
  capital: 0,
  lang: (localStorage.getItem('pos_lang') as 'fr' | 'ar') || 'fr',
  theme: (localStorage.getItem('pos_theme') as 'dark' | 'light') || 'dark',
  toasts: [],

  applySession: (payload) => {
    if (!payload?.user) return;
    const user: SessionUser = payload.user;
    set({
      currentUser: user,
      currentStore: payload.store || null,
      stores: payload.stores || [],
      capabilities: payload.capabilities || { canSeeCost: false },
      sessionChecked: true
    });
    // On ouvre sur un onglet réellement autorisé, jamais sur un écran vide.
    const current = get().activeTab;
    const allowed = TAB_MODULES.find(t => t.tab === current);
    if (!allowed || !can(user, allowed.module, 'view')) {
      set({ activeTab: get().defaultTab() });
    }
  },

  restoreSession: async () => {
    try {
      const payload = await invokeIpc<any>('auth-session');
      if (payload?.user) get().applySession(payload);
    } catch {
      // Pas de session active : l'écran de connexion prend le relais.
    } finally {
      set({ sessionChecked: true });
    }
  },

  signIn: async (username, password) => {
    const payload = await invokeIpc<any>('auth-login', { username, password });
    get().applySession(payload);
    return payload.user as SessionUser;
  },

  signOut: async () => {
    try {
      await invokeIpc('auth-logout');
    } catch {}
    set({
      currentUser: null,
      currentStore: null,
      capabilities: { canSeeCost: false },
      cart: [],
      selectedClient: null,
      activeTab: 'pos'
    });
  },

  setCurrentStore: (store) => set({ currentStore: store }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCapital: (capital) => set({ capital }),
  setLang: (lang) => {
    localStorage.setItem('pos_lang', lang);
    set({ lang });
  },
  setTheme: (theme) => {
    localStorage.setItem('pos_theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('pos_theme', next);
    set({ theme: next });
  },

  pushToast: (toast) => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    const ttl = toast.kind === 'error' ? 8000 : 4000;
    setTimeout(() => get().dismissToast(id), ttl);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) }),

  notifyError: (err, fallbackTitle = 'Opération impossible') => {
    const message = err instanceof Error ? err.message : String(err);
    get().pushToast({ kind: 'error', title: fallbackTitle, description: message });
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
      const line = { ...updated[existingIndex] };
      line.qty += 1;
      line.lineTotal = line.qty * line.unitPrice;
      updated[existingIndex] = line;
      set({ cart: updated });
      return;
    }

    set({
      cart: [
        { product, productColorId: colorId || null, colorName, qty: 1, priceTier: tier, unitPrice, lineTotal: unitPrice },
        ...cart
      ]
    });
  },

  updateCartQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set({
      cart: get().cart.map(it => (it.product.id === productId ? { ...it, qty, lineTotal: qty * it.unitPrice } : it))
    });
  },

  updateCartPrice: (productId, unitPrice) => {
    set({
      cart: get().cart.map(it => (it.product.id === productId ? { ...it, unitPrice, lineTotal: it.qty * unitPrice } : it))
    });
  },

  updateCartTier: (productId, tier) => {
    set({
      cart: get().cart.map(it => {
        if (it.product.id !== productId) return it;
        let unitPrice = it.product.priceDetail;
        if (tier === 'semi_gros') unitPrice = it.product.priceSemiGros;
        if (tier === 'gros') unitPrice = it.product.priceGros;
        return { ...it, priceTier: tier, unitPrice, lineTotal: it.qty * unitPrice };
      })
    });
  },

  removeFromCart: (productId) => set({ cart: get().cart.filter(it => it.product.id !== productId) }),
  clearCart: () => set({ cart: [], selectedClient: null }),
  setSelectedClient: (client) => set({ selectedClient: client }),
  setCurrentCashSessionId: (id) => set({ currentCashSessionId: id }),

  // Même fonction que celle appliquée côté process principal : l'interface ne
  // propose jamais une action qui serait refusée ensuite.
  hasPermission: (module, action) => can(get().currentUser, module, action),

  defaultTab: () => {
    const user = get().currentUser;
    const found = TAB_MODULES.find(t => can(user, t.module, 'view'));
    return found?.tab || 'pos';
  }
}));
