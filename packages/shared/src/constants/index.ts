// Movement codes legend - audit trail
export const STOCK_MOVEMENT_CODES = {
  ACHAT: 90,             // Stock increase via purchase (Achat) - Special audit visual highlight (red/green)
  VENTE: 91,             // Stock decrease via sale (Vente)
  RETOUR: 92,            // Stock increase via customer return (Retour)
  AJUSTEMENT: 93,        // Manual stock adjustment/correction
  TRANSFERT_SORTANT: 94, // Transfer out to another store
  TRANSFERT_ENTRANT: 95  // Transfer in from another store
} as const;

export type StockMovementCode = typeof STOCK_MOVEMENT_CODES[keyof typeof STOCK_MOVEMENT_CODES];

export const MOVEMENT_CODE_LABELS: Record<StockMovementCode, string> = {
  90: "Réapprovisionnement Achat (+)",
  91: "Vente POS (-)",
  92: "Retour Client (+)",
  93: "Ajustement Manuel (±)",
  94: "Transfert Inter-Boutique Sortant (-)",
  95: "Transfert Inter-Boutique Entrant (+)"
};

// System Modules for Permissions
export const SYSTEM_MODULES = [
  'pos',
  'clients',
  'fournisseurs',
  'produits',
  'stock',
  'achat',
  'rapport',
  'zakat',
  'settings',
  'users'
] as const;

export type SystemModule = typeof SYSTEM_MODULES[number];

export const MODULE_LABELS: Record<SystemModule, string> = {
  pos: 'Caisse & Vente (POS)',
  clients: 'Clients & Crédits',
  fournisseurs: 'Fournisseurs & Dettes',
  produits: 'Catalogue Produits & Proforma',
  stock: 'Gestion des Stocks',
  achat: 'Bons d\'Achat',
  rapport: 'Rapports & Statistiques',
  zakat: 'Calculateur de Zakat',
  settings: 'Paramètres & Profil',
  users: 'Gestion des Utilisateurs'
};

// Price Tiers
export const PRICE_TIERS = ['detail', 'semi_gros', 'gros'] as const;
export type PriceTier = typeof PRICE_TIERS[number];

export const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  detail: 'Prix Détail',
  semi_gros: 'Prix Semi-Gros',
  gros: 'Prix Gros'
};

// Color Modes
export const COLOR_MODES = ['single', 'variants', 'merged'] as const;
export type ColorMode = typeof COLOR_MODES[number];

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  single: 'Une seule couleur',
  variants: 'Plusieurs couleurs (variantes)',
  merged: 'Fusionner (Couleur composite)'
};

// Payment Methods
export const PAYMENT_METHODS = ['cash', 'credit', 'mixed'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  credit: 'À Crédit',
  mixed: 'Mixte (Espèces + Crédit)'
};

// Sale Status
export const SALE_STATUSES = ['completed', 'returned', 'partial_return'] as const;
export type SaleStatus = typeof SALE_STATUSES[number];

// Barcode Limits
export const MAX_BARCODES_PER_PRODUCT = 5;

// Trial Duration
export const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
