import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const stores = sqliteTable('stores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  logoUrl: text('logo_url'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').references(() => stores.id),
  fullName: text('full_name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  role: text('role').notNull().default('cashier'), // owner, manager, cashier
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  module: text('module').notNull(), // pos, clients, fournisseurs, produits, stock, achat, rapport, zakat, settings, users
  canView: integer('can_view', { mode: 'boolean' }).notNull().default(false),
  canEdit: integer('can_edit', { mode: 'boolean' }).notNull().default(false)
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
});

export const brands = sqliteTable('brands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
});

export const colors = sqliteTable('colors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hexCode: text('hex_code').notNull()
});

export const motorcycleModels = sqliteTable('motorcycle_models', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
});

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(), // ART-00001
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  brandId: integer('brand_id').references(() => brands.id),
  priceAchat: integer('price_achat').notNull().default(0), // in centimes
  priceDetail: integer('price_detail').notNull().default(0),
  priceSemiGros: integer('price_semi_gros').notNull().default(0),
  priceGros: integer('price_gros').notNull().default(0),
  colorMode: text('color_mode').notNull().default('single'), // single, variants, merged
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const productBarcodes = sqliteTable('product_barcodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  barcodeValue: text('barcode_value').notNull().unique(),
  source: text('source').notNull().default('auto') // auto, manual
});

export const productColors = sqliteTable('product_colors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  colorId: integer('color_id').notNull().references(() => colors.id),
  mergeGroupId: text('merge_group_id') // null for separate variant; shared string id for merged composite color
});

export const productMotorcycleCompat = sqliteTable('product_motorcycle_compat', {
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  motorcycleModelId: integer('motorcycle_model_id').notNull().references(() => motorcycleModels.id, { onDelete: 'cascade' })
});

export const productStock = sqliteTable('product_stock', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: integer('store_id').notNull().references(() => stores.id),
  quantity: integer('quantity').notNull().default(0)
});

export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').notNull().references(() => products.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  movementCode: integer('movement_code').notNull(), // 90=Achat, 91=Vente, 92=Retour, 93=Ajustement, 94=Transfert Sortant, 95=Transfert Entrant
  qtyBefore: integer('qty_before').notNull(),
  qtyAfter: integer('qty_after').notNull(),
  delta: integer('delta').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  refType: text('ref_type'), // 'purchase', 'sale', 'return', 'transfer', 'manual'
  refId: integer('ref_id'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  isFidele: integer('is_fidele', { mode: 'boolean' }).notNull().default(false),
  creditLimit: integer('credit_limit').notNull().default(0), // centimes
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const clientTransactions = sqliteTable('client_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull().references(() => clients.id),
  type: text('type').notNull(), // 'achat', 'versement', 'dette_adjust'
  amount: integer('amount').notNull(), // centimes
  saleId: integer('sale_id'),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const supplierTransactions = sqliteTable('supplier_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  type: text('type').notNull(), // 'achat', 'versement', 'dette_adjust'
  amount: integer('amount').notNull(), // centimes
  purchaseId: integer('purchase_id'),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const cashSessions = sqliteTable('cash_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').notNull().references(() => stores.id),
  userId: integer('user_id').notNull().references(() => users.id),
  openingAmount: integer('opening_amount').notNull().default(0), // centimes
  expectedAmount: integer('expected_amount').notNull().default(0),
  countedAmount: integer('counted_amount').notNull().default(0),
  openedAt: text('opened_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  closedAt: text('closed_at')
});

export const sales = sqliteTable('sales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').notNull().references(() => stores.id),
  clientId: integer('client_id').references(() => clients.id),
  userId: integer('user_id').notNull().references(() => users.id),
  cashSessionId: integer('cash_session_id').references(() => cashSessions.id),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  total: integer('total').notNull(),
  amountPaid: integer('amount_paid').notNull(),
  amountCredit: integer('amount_credit').notNull().default(0),
  paymentType: text('payment_type').notNull().default('cash'), // 'cash', 'credit', 'mixed'
  status: text('status').notNull().default('completed'), // 'completed', 'returned', 'partial_return'
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const saleItems = sqliteTable('sale_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  productColorId: integer('product_color_id').references(() => productColors.id),
  priceTier: text('price_tier').notNull().default('detail'), // 'detail', 'semi_gros', 'gros'
  qty: integer('qty').notNull(),
  unitPrice: integer('unit_price').notNull(), // centimes
  lineTotal: integer('line_total').notNull() // centimes
});

export const returns = sqliteTable('returns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id').notNull().references(() => sales.id),
  storeId: integer('store_id').notNull().references(() => stores.id),
  userId: integer('user_id').notNull().references(() => users.id),
  totalRefund: integer('total_refund').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const returnItems = sqliteTable('return_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  returnId: integer('return_id').notNull().references(() => returns.id, { onDelete: 'cascade' }),
  saleItemId: integer('sale_item_id').notNull().references(() => saleItems.id),
  qtyReturned: integer('qty_returned').notNull(),
  unitPrice: integer('unit_price').notNull(),
  lineTotal: integer('line_total').notNull()
});

export const purchases = sqliteTable('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').notNull().references(() => stores.id),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  userId: integer('user_id').notNull().references(() => users.id),
  total: integer('total').notNull(),
  amountPaid: integer('amount_paid').notNull().default(0),
  paymentType: text('payment_type').notNull().default('cash'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const purchaseItems = sqliteTable('purchase_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  purchaseId: integer('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  unitCost: integer('unit_cost').notNull(),
  lineTotal: integer('line_total').notNull()
});

export const stockTransfers = sqliteTable('stock_transfers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromStoreId: integer('from_store_id').notNull().references(() => stores.id),
  toStoreId: integer('to_store_id').notNull().references(() => stores.id),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storeId: integer('store_id').notNull().references(() => stores.id).unique(),
  storeName: text('store_name').notNull().default('Pièces Cycles & Motos'),
  address: text('address').notNull().default(''),
  phone: text('phone').notNull().default(''),
  logoUrl: text('logo_url'),
  printerType: text('printer_type').notNull().default('none'), // 'usb', 'network', 'none'
  printerTarget: text('printer_target').notNull().default(''),
  receiptFooter: text('receipt_footer').notNull().default('Merci de votre visite et à bientôt !'),
  taxRate: integer('tax_rate').notNull().default(0), // 0%
  nif: text('nif').default(''),
  nis: text('nis').default(''),
  rc: text('rc').default(''),
  articleImposition: text('article_imposition').default('')
});

export const zakatSnapshots = sqliteTable('zakat_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  snapshotDate: text('snapshot_date').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  capital: integer('capital').notNull(),
  cashOnHand: integer('cash_on_hand').notNull(),
  receivables: integer('receivables').notNull(),
  shortTermDebts: integer('short_term_debts').notNull(),
  netZakatable: integer('net_zakatable').notNull(),
  nisabThreshold: integer('nisab_threshold').notNull(),
  zakatDue: integer('zakat_due').notNull(),
  note: text('note')
});

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  module: text('module').notNull(),
  detailsJson: text('details_json'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  action: text('action').notNull(), // 'insert', 'update', 'delete'
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'synced', 'failed'
  attempts: integer('attempts').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`)
});
