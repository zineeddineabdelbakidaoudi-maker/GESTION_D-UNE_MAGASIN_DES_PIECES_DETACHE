import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id),
  fullName: text('full_name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  role: text('role').notNull().default('cashier'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  module: text('module').notNull(),
  canView: boolean('can_view').notNull().default(false),
  canEdit: boolean('can_edit').notNull().default(false)
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique()
});

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique()
});

export const colors = pgTable('colors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  hexCode: text('hex_code').notNull()
});

export const motorcycleModels = pgTable('motorcycle_models', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique()
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  brandId: integer('brand_id').references(() => brands.id),
  priceAchat: integer('price_achat').notNull().default(0),
  priceDetail: integer('price_detail').notNull().default(0),
  priceSemiGros: integer('price_semi_gros').notNull().default(0),
  priceGros: integer('price_gros').notNull().default(0),
  colorMode: text('color_mode').notNull().default('single'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const productBarcodes = pgTable('product_barcodes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  barcodeValue: text('barcode_value').notNull().unique(),
  source: text('source').notNull().default('auto')
});

export const productColors = pgTable('product_colors', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  colorId: integer('color_id').notNull().references(() => colors.id),
  mergeGroupId: text('merge_group_id')
});

export const productMotorcycleCompat = pgTable('product_motorcycle_compat', {
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  motorcycleModelId: integer('motorcycle_model_id').notNull().references(() => motorcycleModels.id, { onDelete: 'cascade' })
});

export const productStock = pgTable('product_stock', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: integer('store_id').notNull().references(() => stores.id),
  quantity: integer('quantity').notNull().default(0)
});

export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  movementCode: integer('movement_code').notNull(),
  qtyBefore: integer('qty_before').notNull(),
  qtyAfter: integer('qty_after').notNull(),
  delta: integer('delta').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  refType: text('ref_type'),
  refId: integer('ref_id'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  isFidele: boolean('is_fidele').notNull().default(false),
  creditLimit: integer('credit_limit').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const clientTransactions = pgTable('client_transactions', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  saleId: integer('sale_id'),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const supplierTransactions = pgTable('supplier_transactions', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  purchaseId: integer('purchase_id'),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const cashSessions = pgTable('cash_sessions', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  userId: integer('user_id').notNull().references(() => users.id),
  openingAmount: integer('opening_amount').notNull().default(0),
  expectedAmount: integer('expected_amount').notNull().default(0),
  countedAmount: integer('counted_amount').notNull().default(0),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
  closedAt: timestamp('closed_at')
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  clientId: integer('client_id').references(() => clients.id),
  userId: integer('user_id').notNull().references(() => users.id),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  total: integer('total').notNull(),
  amountPaid: integer('amount_paid').notNull(),
  amountCredit: integer('amount_credit').notNull().default(0),
  paymentType: text('payment_type').notNull().default('cash'),
  status: text('status').notNull().default('completed'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const saleItems = pgTable('sale_items', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  productColorId: integer('product_color_id').references(() => productColors.id),
  priceTier: text('price_tier').notNull().default('detail'),
  qty: integer('qty').notNull(),
  unitPrice: integer('unit_price').notNull(),
  lineTotal: integer('line_total').notNull()
});

export const returns = pgTable('returns', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').notNull().references(() => sales.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  userId: integer('user_id').notNull().references(() => users.id),
  totalRefund: integer('total_refund').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const returnItems = pgTable('return_items', {
  id: serial('id').primaryKey(),
  returnId: integer('return_id').notNull().references(() => returns.id, { onDelete: 'cascade' }),
  saleItemId: integer('sale_item_id').notNull().references(() => saleItems.id),
  qtyReturned: integer('qty_returned').notNull(),
  unitPrice: integer('unit_price').notNull(),
  lineTotal: integer('line_total').notNull()
});

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  userId: integer('user_id').notNull().references(() => users.id),
  total: integer('total').notNull(),
  amountPaid: integer('amount_paid').notNull().default(0),
  paymentType: text('payment_type').notNull().default('cash'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const purchaseItems = pgTable('purchase_items', {
  id: serial('id').primaryKey(),
  purchaseId: integer('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  unitCost: integer('unit_cost').notNull(),
  lineTotal: integer('line_total').notNull()
});

export const stockTransfers = pgTable('stock_transfers', {
  id: serial('id').primaryKey(),
  fromStoreId: integer('from_store_id').notNull().references(() => stores.id),
  toStoreId: integer('to_store_id').notNull().references(() => stores.id),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => stores.id).unique(),
  storeName: text('store_name').notNull().default('Pièces Cycles & Motos'),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  logoUrl: text('logo_url'),
  printerType: text('printer_type').notNull().default('none'),
  printerTarget: text('printer_target').notNull().default(''),
  receiptFooter: text('receipt_footer').notNull().default('Merci de votre visite et à bientôt !'),
  taxRate: integer('tax_rate').notNull().default(0),
  nif: text('nif').default(''),
  nis: text('nis').default(''),
  rc: text('rc').default(''),
  articleImposition: text('article_imposition').default('')
});

export const zakatSnapshots = pgTable('zakat_snapshots', {
  id: serial('id').primaryKey(),
  snapshotDate: timestamp('snapshot_date').notNull().defaultNow(),
  capital: integer('capital').notNull(),
  cashOnHand: integer('cash_on_hand').notNull(),
  receivables: integer('receivables').notNull(),
  shortTermDebts: integer('short_term_debts').notNull(),
  netZakatable: integer('net_zakatable').notNull(),
  nisabThreshold: integer('nisab_threshold').notNull(),
  zakatDue: integer('zakat_due').notNull(),
  note: text('note')
});

export const activityLog = pgTable('activity_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  module: text('module').notNull(),
  detailsJson: text('details_json'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});
