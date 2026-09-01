import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import bcrypt from 'bcryptjs';
import { 
  SEEDED_COLORS, 
  DEFAULT_MOTORCYCLE_MODELS, 
  SYSTEM_MODULES, 
  STOCK_MOVEMENT_CODES, 
  formatProductCode, 
  generateBarcodeValue 
} from '@gestion-veloo/shared';

let db: Database.Database | null = null;

export function getLocalDb(): Database.Database {
  if (db) return db;

  const userDataPath = app ? app.getPath('userData') : path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'pos_local.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initLocalSchema(db);
  seedLocalData(db);

  return db;
}

function initLocalSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      logo_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER REFERENCES stores(id),
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      can_view INTEGER NOT NULL DEFAULT 0,
      can_edit INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hex_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS motorcycle_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      brand_id INTEGER REFERENCES brands(id),
      price_achat INTEGER NOT NULL DEFAULT 0,
      price_detail INTEGER NOT NULL DEFAULT 0,
      price_semi_gros INTEGER NOT NULL DEFAULT 0,
      price_gros INTEGER NOT NULL DEFAULT 0,
      color_mode TEXT NOT NULL DEFAULT 'single',
      location TEXT NOT NULL DEFAULT '',
      photo_base64 TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      barcode_value TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'auto'
    );

    CREATE TABLE IF NOT EXISTS product_colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      color_id INTEGER NOT NULL REFERENCES colors(id),
      merge_group_id TEXT
    );

    CREATE TABLE IF NOT EXISTS product_motorcycle_compat (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      motorcycle_model_id INTEGER NOT NULL REFERENCES motorcycle_models(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, motorcycle_model_id)
    );

    CREATE TABLE IF NOT EXISTS product_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      quantity INTEGER NOT NULL DEFAULT 0,
      UNIQUE(product_id, store_id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      store_id INTEGER NOT NULL REFERENCES stores(id),
      movement_code INTEGER NOT NULL,
      qty_before INTEGER NOT NULL,
      qty_after INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ref_type TEXT,
      ref_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      is_fidele INTEGER NOT NULL DEFAULT 0,
      credit_limit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      sale_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      purchase_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      opening_amount INTEGER NOT NULL DEFAULT 0,
      expected_amount INTEGER NOT NULL DEFAULT 0,
      counted_amount INTEGER NOT NULL DEFAULT 0,
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      client_id INTEGER REFERENCES clients(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      cash_session_id INTEGER REFERENCES cash_sessions(id),
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL,
      amount_credit INTEGER NOT NULL DEFAULT 0,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_color_id INTEGER REFERENCES product_colors(id),
      price_tier TEXT NOT NULL DEFAULT 'detail',
      qty INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      store_id INTEGER NOT NULL REFERENCES stores(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      total_refund INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      qty_returned INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      total INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL,
      line_total INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_store_id INTEGER NOT NULL REFERENCES stores(id),
      to_store_id INTEGER NOT NULL REFERENCES stores(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id) UNIQUE,
      store_name TEXT NOT NULL DEFAULT 'Pièces Cycles & Motos',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      logo_url TEXT,
      printer_type TEXT NOT NULL DEFAULT 'none',
      printer_target TEXT NOT NULL DEFAULT '',
      receipt_footer TEXT NOT NULL DEFAULT 'Merci de votre visite et à bientôt !',
      tax_rate INTEGER NOT NULL DEFAULT 0,
      nif TEXT DEFAULT '',
      nis TEXT DEFAULT '',
      rc TEXT DEFAULT '',
      article_imposition TEXT DEFAULT '',
      avg_price_mode INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS zakat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      capital INTEGER NOT NULL,
      cash_on_hand INTEGER NOT NULL,
      receivables INTEGER NOT NULL,
      short_term_debts INTEGER NOT NULL,
      net_zakatable INTEGER NOT NULL,
      nisab_threshold INTEGER NOT NULL,
      zakat_due INTEGER NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS depenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      category_id INTEGER NOT NULL REFERENCES expense_categories(id),
      amount INTEGER NOT NULL,
      note TEXT DEFAULT '',
      user_id INTEGER NOT NULL REFERENCES users(id),
      depense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
      action TEXT PRIMARY KEY,
      shortcut TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_barcodes_val ON product_barcodes(barcode_value);
    CREATE INDEX IF NOT EXISTS idx_stock_prod_store ON product_stock(product_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_movements_prod_store ON stock_movements(product_id, store_id, movement_code);
    CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_store_date ON purchases(store_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_purchases_supp ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_pur ON purchase_items(purchase_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_client_tx_client ON client_transactions(client_id);
    CREATE INDEX IF NOT EXISTS idx_supp_tx_supp ON supplier_transactions(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_depenses_store_date ON depenses(store_id, depense_date);
  `);

  // Migrate existing DBs: add new columns if they don't exist
  try { db.exec(`ALTER TABLE products ADD COLUMN location TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE settings ADD COLUMN avg_price_mode INTEGER NOT NULL DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE products ADD COLUMN photo_base64 TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); } catch {}
}

function seedLocalData(db: Database.Database) {
  const storeCount = db.prepare('SELECT COUNT(*) as cnt FROM stores').get() as any;
  if (storeCount && storeCount.cnt > 0) return; // already seeded

  const insertStore = db.prepare('INSERT INTO stores (id, name, address, phone) VALUES (?, ?, ?, ?)');
  insertStore.run(1, 'Boutique Centre-Ville (Store 1)', 'Rue Didouche Mourad, Alger', '0550 11 22 33');
  insertStore.run(2, 'Boutique Zone Industrielle (Store 2)', 'Zone d\'Activité Oued Smar, Alger', '0550 44 55 66');

  const insertSetting = db.prepare(`
    INSERT INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSetting.run(1, 'Pièces Cycles & Motos - Centre', 'Rue Didouche Mourad, Alger', '0550 11 22 33', 'none', '', 'Merci pour votre confiance ! Pièces garanties.', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');
  insertSetting.run(2, 'Pièces Cycles & Motos - Dépôt', 'Zone d\'Activité Oued Smar, Alger', '0550 44 55 66', 'none', '', 'Merci pour votre confiance !', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');

  const passAdmin = bcrypt.hashSync('admin123', 10);
  const passSeller = bcrypt.hashSync('vendeur123', 10);

  const insertUser = db.prepare('INSERT INTO users (id, store_id, full_name, username, password_hash, is_active, role) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertUser.run(1, 1, 'Propriétaire Gérant', 'admin', passAdmin, 1, 'owner');
  insertUser.run(2, 1, 'Vendeur Magasin 1', 'vendeur1', passSeller, 1, 'cashier');
  insertUser.run(3, 2, 'Vendeur Magasin 2', 'vendeur2', passSeller, 1, 'cashier');

  const insertPerm = db.prepare('INSERT INTO permissions (user_id, module, can_view, can_edit) VALUES (?, ?, ?, ?)');
  for (const m of SYSTEM_MODULES) {
    insertPerm.run(1, m, 1, 1);
    insertPerm.run(2, m, 1, m === 'settings' || m === 'rapport' || m === 'zakat' ? 0 : 1);
    insertPerm.run(3, m, 1, m === 'settings' || m === 'rapport' || m === 'zakat' ? 0 : 1);
  }

  const insertColor = db.prepare('INSERT INTO colors (id, name, hex_code) VALUES (?, ?, ?)');
  SEEDED_COLORS.forEach((c, idx) => insertColor.run(idx + 1, c.name, c.hexCode));

  const insertMoto = db.prepare('INSERT INTO motorcycle_models (id, name) VALUES (?, ?)');
  DEFAULT_MOTORCYCLE_MODELS.forEach((m, idx) => insertMoto.run(idx + 1, m));

  const categoriesList = ['Moteur & Cylindres', 'Freinage & Disques', 'Éclairage & Optiques', 'Casques & Équipements', 'Transmission & Chaînes', 'Pneus & Chambres à air', 'Carrosserie & Carénage', 'Huiles & Entretien'];
  const insertCat = db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)');
  categoriesList.forEach((c, idx) => insertCat.run(idx + 1, c));

  const brandsList = ['Yamaha Genuine', 'SYM Original', 'Brembo', 'NGK', 'Motul', 'Kenda', 'Michelin', 'VMS Racing', 'Haodjin OEM', 'Generic Parts'];
  const insertBrand = db.prepare('INSERT INTO brands (id, name) VALUES (?, ?)');
  brandsList.forEach((b, idx) => insertBrand.run(idx + 1, b));

  const sampleProducts = [
    { id: 1, name: 'Plaquettes de Frein Avant Céramique', cat: 2, brand: 3, pAchat: 120000, pDet: 220000, pSemi: 190000, pGros: 170000, colorMode: 'single', colorId: 10, stock1: 25, stock2: 15, motos: [1, 2, 3] },
    { id: 2, name: 'Kit Chaîne Renforcé O-Ring 428-130L', cat: 5, brand: 1, pAchat: 350000, pDet: 550000, pSemi: 480000, pGros: 420000, colorMode: 'single', colorId: 77, stock1: 18, stock2: 12, motos: [1, 2, 4] },
    { id: 3, name: 'Casque Intégral Bicolore Sport GT', cat: 4, brand: 8, pAchat: 650000, pDet: 1100000, pSemi: 950000, pGros: 850000, colorMode: 'merged', colorIds: [1, 21], stock1: 8, stock2: 6, motos: [36] },
    { id: 4, name: 'Cylindre Piston Complet 150cc CG', cat: 1, brand: 9, pAchat: 420000, pDet: 680000, pSemi: 590000, pGros: 520000, colorMode: 'single', colorId: 10, stock1: 14, stock2: 10, motos: [1, 2, 8, 9] },
    { id: 5, name: 'Feu Arrière LED Fumée + Clignotants Intégrés', cat: 3, brand: 10, pAchat: 180000, pDet: 320000, pSemi: 280000, pGros: 240000, colorMode: 'variants', colorIds: [21, 35, 1], stock1: 30, stock2: 20, motos: [1, 3, 10] },
    { id: 6, name: 'Huile Moteur Synthèse 10W40 4T (1L)', cat: 8, brand: 5, pAchat: 95000, pDet: 160000, pSemi: 140000, pGros: 125000, colorMode: 'single', colorId: 78, stock1: 50, stock2: 40, motos: [36] },
    { id: 7, name: 'Pneu Arrière Tubeless 130/70-12', cat: 6, brand: 6, pAchat: 380000, pDet: 580000, pSemi: 520000, pGros: 460000, colorMode: 'single', colorId: 1, stock1: 12, stock2: 8, motos: [10, 11, 12, 13] },
    { id: 8, name: 'Bougie d\'Allumage Iridium CR8EIX', cat: 1, brand: 4, pAchat: 75000, pDet: 140000, pSemi: 120000, pGros: 105000, colorMode: 'single', colorId: 12, stock1: 45, stock2: 30, motos: [1, 2, 3, 4, 10] }
  ];

  const insertProd = db.prepare('INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertBarcode = db.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
  const insertProdColor = db.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
  const insertCompat = db.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
  const insertStock = db.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
  const insertMovement = db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const p of sampleProducts) {
    insertProd.run(p.id, formatProductCode(p.id), p.name, p.cat, p.brand, p.pAchat, p.pDet, p.pSemi, p.pGros, p.colorMode);
    insertBarcode.run(p.id, generateBarcodeValue(p.id), 'auto');

    if (p.colorMode === 'single' && p.colorId) {
      insertProdColor.run(p.id, p.colorId, null);
    } else if (p.colorMode === 'merged' && p.colorIds) {
      for (const cid of p.colorIds) insertProdColor.run(p.id, cid, `merge-${p.id}`);
    } else if (p.colorMode === 'variants' && p.colorIds) {
      for (const cid of p.colorIds) insertProdColor.run(p.id, cid, null);
    }

    for (const mid of p.motos) insertCompat.run(p.id, mid);

    insertStock.run(p.id, 1, p.stock1);
    insertStock.run(p.id, 2, p.stock2);

    insertMovement.run(p.id, 1, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock1, p.stock1, 1, 'initial_stock', null);
    insertMovement.run(p.id, 2, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock2, p.stock2, 1, 'initial_stock', null);
  }

  const insertClient = db.prepare('INSERT INTO clients (id, name, phone, address, is_fidele, credit_limit) VALUES (?, ?, ?, ?, ?, ?)');
  insertClient.run(1, 'Mourad Moto Express', '0555 12 34 56', 'Kouba, Alger', 1, 10000000);
  insertClient.run(2, 'Atelier Réparation Karim', '0661 98 76 54', 'Bab El Oued, Alger', 1, 15000000);
  insertClient.run(3, 'Amine Coursier', '0770 45 67 89', 'Hydra, Alger', 0, 5000000);

  const insertClientTx = db.prepare('INSERT INTO client_transactions (id, client_id, type, amount, note) VALUES (?, ?, ?, ?, ?)');
  insertClientTx.run(1, 2, 'achat', 3500000, 'Solde initial reporté');

  const insertSupplier = db.prepare('INSERT INTO suppliers (id, name, phone, address) VALUES (?, ?, ?, ?)');
  insertSupplier.run(1, 'Importateur Pièces Moto Alger (SARL Mototech)', '023 50 60 70', 'Zone Industrielle Rouiba');
  insertSupplier.run(2, 'Grossiste Accessoires & Casques Algérie', '021 66 77 88', 'El Eulma / Alger');
  insertSupplier.run(3, 'Distributeur Huiles & Pneumatiques DZ', '025 40 30 20', 'Blida');

  const insertSupplierTx = db.prepare('INSERT INTO supplier_transactions (id, supplier_id, type, amount, note) VALUES (?, ?, ?, ?, ?)');
  insertSupplierTx.run(1, 1, 'achat', 15000000, 'Facture arrivage container #CT-2026-08');

  // Seed expense categories
  const expCatCount = db.prepare('SELECT COUNT(*) as cnt FROM expense_categories').get() as any;
  if (!expCatCount || expCatCount.cnt === 0) {
    const insertExpCat = db.prepare('INSERT INTO expense_categories (id, name) VALUES (?, ?)');
    const expenseCategories = [
      [1, 'Paiement de facture / Compte'],
      [2, 'Électricité'],
      [3, 'Eau'],
      [4, 'Loyer'],
      [5, 'Réparation / Maintenance'],
      [6, 'Achat pour Hanout (fournitures internes)'],
      [7, 'Transport'],
      [8, 'Salaires'],
      [9, 'Autre']
    ];
    for (const [id, name] of expenseCategories) insertExpCat.run(id, name);
  }

  // Seed default keyboard shortcuts
  const shortcutCount = db.prepare('SELECT COUNT(*) as cnt FROM keyboard_shortcuts').get() as any;
  if (!shortcutCount || shortcutCount.cnt === 0) {
    const insertShortcut = db.prepare('INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?, ?)');
    const defaultShortcuts = [
      ['goto_pos', 'F1'],
      ['goto_produits', 'F2'],
      ['goto_stock', 'F3'],
      ['goto_achat', 'F4'],
      ['goto_clients', 'F5'],
      ['goto_fournisseurs', 'F6'],
      ['goto_rapport', 'F7'],
      ['goto_depenses', 'F8'],
      ['goto_settings', 'F9'],
      ['confirm', 'Enter'],
      ['cancel', 'Escape'],
      ['retour', 'Control+R'],
      ['edit_product', 'Control+E'],
      ['add_product', 'Control+N'],
      ['search', 'Control+F'],
      ['clear_cart', 'Control+D'],
      ['print_receipt', 'Control+P'],
      ['toggle_price_tier', 'Control+T'],
      ['save', 'Control+S'],
      ['toggle_session', 'Control+Shift+S']
    ];
    for (const [action, shortcut] of defaultShortcuts) insertShortcut.run(action, shortcut);
  }

  // Seed first_install_date for 24h trial
  const installDateRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('first_install_date') as any;
  if (!installDateRow) {
    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run('first_install_date', Date.now().toString());
  }
}
