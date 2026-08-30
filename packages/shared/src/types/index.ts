import type { StockMovementCode, SystemModule, PriceTier, ColorMode, PaymentMethod, SaleStatus } from '../constants';

export type { StockMovementCode, SystemModule, PriceTier, ColorMode, PaymentMethod, SaleStatus };

export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string;
  logoUrl?: string | null;
  createdAt: string;
}

export interface User {
  id: number;
  storeId?: number | null;
  fullName: string;
  username: string;
  passwordHash?: string;
  isActive: boolean;
  role?: 'owner' | 'manager' | 'cashier';
  createdAt: string;
  permissions?: Permission[];
}

export interface Permission {
  id: number;
  userId: number;
  module: SystemModule;
  canView: boolean;
  canEdit: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Color {
  id: number;
  name: string;
  hexCode: string;
}

export interface MotorcycleModel {
  id: number;
  name: string;
}

export interface ProductBarcode {
  id?: number;
  productId: number;
  barcodeValue: string;
  source: 'auto' | 'manual';
}

export interface ProductColor {
  id?: number;
  productId: number;
  colorId: number;
  mergeGroupId?: string | null;
  color?: Color;
  name?: string;
  hexCode?: string;
}

export interface ProductStock {
  id?: number;
  productId: number;
  storeId: number;
  quantity: number;
}

export interface Product {
  id: number;
  code: string; // e.g. ART-00001
  name: string;
  categoryId?: number | null;
  brandId?: number | null;
  categoryName?: string;
  brandName?: string;
  priceAchat: number; // in centimes
  priceDetail: number; // in centimes
  priceSemiGros: number; // in centimes
  priceGros: number; // in centimes
  colorMode: ColorMode;
  createdAt: string;
  updatedAt?: string;

  // Relations/Aggregates
  category?: Category;
  brand?: Brand;
  barcodes?: ProductBarcode[];
  colors?: ProductColor[];
  compatibleModels?: MotorcycleModel[];
  stock?: ProductStock[];
  totalStock?: number;
}

export interface StockMovement {
  id: number;
  productId: number;
  storeId: number;
  movementCode: StockMovementCode;
  qtyBefore: number;
  qtyAfter: number;
  delta: number;
  userId: number;
  refType?: string | null;
  refId?: number | null;
  createdAt: string;
  
  // Joins
  product?: Product;
  user?: User;
  store?: Store;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  address: string;
  isFidele: boolean;
  creditLimit: number; // in centimes
  currentDebt?: number; // computed balance
  createdAt: string;
}

export interface ClientTransaction {
  id: number;
  clientId: number;
  type: 'achat' | 'versement' | 'dette_adjust';
  amount: number; // in centimes
  saleId?: number | null;
  note?: string | null;
  createdAt: string;
  client?: Client;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  address: string;
  currentDebt?: number; // computed balance
  createdAt: string;
}

export interface SupplierTransaction {
  id: number;
  supplierId: number;
  type: 'achat' | 'versement' | 'dette_adjust';
  amount: number; // in centimes
  purchaseId?: number | null;
  note?: string | null;
  createdAt: string;
  supplier?: Supplier;
}

export interface CashSession {
  id: number;
  storeId: number;
  userId: number;
  openingAmount: number; // centimes
  expectedAmount?: number; // centimes
  countedAmount?: number; // centimes
  openedAt: string;
  closedAt?: string | null;
  user?: User;
}

export interface SaleItem {
  id?: number;
  saleId?: number;
  productId: number;
  productColorId?: number | null;
  priceTier: PriceTier;
  qty: number;
  unitPrice: number; // centimes
  lineTotal: number; // centimes
  product?: Product;
  color?: Color;
}

export interface Sale {
  id: number;
  storeId: number;
  clientId?: number | null;
  userId: number;
  cashSessionId?: number | null;
  subtotal: number; // centimes
  discount?: number; // centimes
  total: number; // centimes
  amountPaid: number; // centimes
  amountCredit: number; // centimes
  paymentType: PaymentMethod;
  status: SaleStatus;
  createdAt: string;
  
  items?: SaleItem[];
  client?: Client;
  user?: User;
  store?: Store;
}

export interface ReturnItem {
  id?: number;
  returnId?: number;
  saleItemId: number;
  qtyReturned: number;
  unitPrice: number;
  lineTotal: number;
  product?: Product;
}

export interface ReturnRecord {
  id: number;
  saleId: number;
  storeId: number;
  userId: number;
  totalRefund: number; // centimes
  createdAt: string;
  items?: ReturnItem[];
  sale?: Sale;
  user?: User;
}

export interface PurchaseItem {
  id?: number;
  purchaseId?: number;
  productId: number;
  qty: number;
  unitCost: number; // centimes
  lineTotal: number; // centimes
  product?: Product;
}

export interface Purchase {
  id: number;
  storeId: number;
  supplierId: number;
  userId: number;
  total: number; // centimes
  amountPaid: number; // centimes
  paymentType: PaymentMethod;
  createdAt: string;
  items?: PurchaseItem[];
  supplier?: Supplier;
  user?: User;
}

export interface StockTransfer {
  id: number;
  fromStoreId: number;
  toStoreId: number;
  productId: number;
  qty: number;
  userId: number;
  note?: string | null;
  createdAt: string;
  product?: Product;
  fromStore?: Store;
  toStore?: Store;
  user?: User;
}

export interface StoreSettings {
  id: number;
  storeId: number;
  storeName: string;
  address: string;
  phone: string;
  logoUrl?: string | null;
  printerType: 'usb' | 'network' | 'none';
  printerTarget: string; // e.g. USB port or IP:9100
  receiptFooter: string;
  taxRate: number; // e.g. 0 or 19%
  nif?: string;
  nis?: string;
  rc?: string;
  articleImposition?: string;
}

export interface ZakatSnapshot {
  id: number;
  snapshotDate: string;
  capital: number; // centimes
  cashOnHand: number; // centimes
  receivables: number; // centimes
  shortTermDebts: number; // centimes
  netZakatable: number; // centimes
  nisabThreshold: number; // centimes
  zakatDue: number; // centimes
  note?: string | null;
}

export interface ActivityLog {
  id: number;
  userId: number;
  action: string;
  module: SystemModule;
  detailsJson?: string | null;
  createdAt: string;
  user?: User;
}

// Sync Payload Types
export interface SyncBatchPayload {
  storeId: number;
  lastSyncTimestamp: string;
  sales: Sale[];
  returns: ReturnRecord[];
  purchases: Purchase[];
  stockMovements: StockMovement[];
  clientTransactions: ClientTransaction[];
  supplierTransactions: SupplierTransaction[];
  stockTransfers: StockTransfer[];
  activityLogs: ActivityLog[];
}

export interface SyncResponse {
  success: boolean;
  syncedTimestamp: string;
  catalogUpdates?: {
    products: Product[];
    categories: Category[];
    brands: Brand[];
    motorcycleModels: MotorcycleModel[];
    colors: Color[];
  };
}

// Reports Types
export interface ReportSummary {
  period: 'day' | 'week' | 'month' | 'custom';
  startDate: string;
  endDate: string;
  storeId?: number;
  totalVentes: number; // centimes
  totalCA: number; // centimes
  totalBenefices: number; // centimes
  totalAchats: number; // centimes
  totalDetteClients: number; // centimes
  totalDetteFournisseurs: number; // centimes
  salesCount: number;
  chartData: Array<{
    date: string;
    ca: number;
    benefice: number;
    ventesCount: number;
  }>;
  topProducts: Array<{
    productId: number;
    productName: string;
    code: string;
    qtySold: number;
    revenue: number;
  }>;
}

// Trial State
export interface TrialState {
  isExpired: boolean;
  buildTime: number;
  remainingMs: number;
  remainingHours: number;
  remainingMinutes: number;
  message: string;
}
