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
  DEFAULT_ROLE_PERMISSIONS,
  permissionMatrixToRows,
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
  db.pragma('busy_timeout = 5000');

  initLocalSchema(db);
  runMigrations(db);
  seedLocalData(db);
  seedDefaults(db);

  return db;
}

export function getDbFilePath(): string {
  const userDataPath = app ? app.getPath('userData') : path.resolve(process.cwd(), 'data');
  return path.join(userDataPath, 'pos_local.sqlite');
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
      can_edit INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, module)
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
      -- 1 quand les quantites sont saisies couleur par couleur : le total de
      -- l'article devient la somme des couleurs et n'est plus saisi a la main.
      color_stock_tracked INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'PCS',
      location TEXT NOT NULL DEFAULT '',
      photo_base64 TEXT DEFAULT NULL,
      min_stock INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
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

    -- Stock detaille par couleur, pour les articles declines en variantes.
    -- Le total de product_stock reste la somme de ces lignes : c'est lui que
    -- lisent la caisse et les rapports, aucune requete existante ne change.
    CREATE TABLE IF NOT EXISTS product_color_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_color_id INTEGER NOT NULL REFERENCES product_colors(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      quantity INTEGER NOT NULL DEFAULT 0,
      UNIQUE(product_color_id, store_id)
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
      unit_cost INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ref_type TEXT,
      ref_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_cost_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      store_id INTEGER REFERENCES stores(id),
      previous_cost INTEGER NOT NULL,
      incoming_cost INTEGER NOT NULL,
      new_cost INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      strategy TEXT NOT NULL,
      reason TEXT NOT NULL,
      ref_type TEXT,
      ref_id INTEGER,
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
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
      unit_cost_snapshot INTEGER NOT NULL DEFAULT 0,
      line_total INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      store_id INTEGER NOT NULL REFERENCES stores(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      total_refund INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      qty_returned INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      unit_cost_snapshot INTEGER NOT NULL DEFAULT 0,
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
      reference TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_color_id INTEGER REFERENCES product_colors(id),
      qty INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      cost_strategy TEXT NOT NULL DEFAULT '',
      cost_before INTEGER NOT NULL DEFAULT 0,
      cost_after INTEGER NOT NULL DEFAULT 0
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
      avg_price_mode INTEGER NOT NULL DEFAULT 1,
      cost_threshold INTEGER NOT NULL DEFAULT 5,
      low_stock_alert INTEGER NOT NULL DEFAULT 5,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT,
      store_id INTEGER,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      severity TEXT NOT NULL DEFAULT 'info',
      summary TEXT NOT NULL DEFAULT '',
      changes_json TEXT,
      metadata_json TEXT,
      device_id TEXT,
      app_version TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      reason TEXT,
      device_id TEXT,
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
      last_error TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_log(module, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_sync ON audit_log(synced_at);
    CREATE INDEX IF NOT EXISTS idx_cost_history_prod ON product_cost_history(product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON return_items(sale_item_id);
    CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(username, created_at DESC);
  `);
}

/**
 * Migrations idempotentes pour les bases déjà installées chez les clients.
 * Chaque étape est sûre à rejouer : on ne perd jamais de données existantes.
 */
function runMigrations(db: Database.Database) {
  const existingColumns = (table: string): Set<string> => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      return new Set(rows.map(r => r.name));
    } catch {
      return new Set();
    }
  };

  const addColumn = (table: string, column: string, definition: string) => {
    if (existingColumns(table).has(column)) return;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
      console.warn(`[migration] ${table}.${column} ignoré:`, (err as Error).message);
    }
  };

  addColumn('products', 'location', `TEXT NOT NULL DEFAULT ''`);
  addColumn('products', 'unit', `TEXT NOT NULL DEFAULT 'PCS'`);
  addColumn('products', 'photo_base64', 'TEXT DEFAULT NULL');
  addColumn('products', 'min_stock', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('products', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');

  addColumn('users', 'last_login_at', 'TEXT');
  addColumn('users', 'failed_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'locked_until', 'TEXT');
  addColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'phone', `TEXT NOT NULL DEFAULT ''`);

  addColumn('settings', 'avg_price_mode', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('settings', 'cost_threshold', 'INTEGER NOT NULL DEFAULT 5');
  addColumn('settings', 'low_stock_alert', 'INTEGER NOT NULL DEFAULT 5');
  addColumn('settings', 'allow_negative_stock', 'INTEGER NOT NULL DEFAULT 0');

  addColumn('sale_items', 'unit_cost_snapshot', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('return_items', 'unit_cost_snapshot', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('returns', 'reason', `TEXT NOT NULL DEFAULT ''`);
  addColumn('purchases', 'reference', `TEXT NOT NULL DEFAULT ''`);
  addColumn('purchase_items', 'cost_strategy', `TEXT NOT NULL DEFAULT ''`);
  addColumn('purchase_items', 'cost_before', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('purchase_items', 'cost_after', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('stock_movements', 'unit_cost', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('stock_movements', 'note', 'TEXT');
  addColumn('client_transactions', 'user_id', 'INTEGER');
  addColumn('supplier_transactions', 'user_id', 'INTEGER');
  addColumn('audit_log', 'synced_at', 'TEXT');
  // Les articles existants gardent leur comptage global : la reprise
  // n'invente aucune repartition par couleur.
  addColumn('products', 'color_stock_tracked', 'INTEGER NOT NULL DEFAULT 0');
  // Une reception doit dire dans quelle couleur elle entre, sinon le detail
  // par couleur cesserait d'egaler le total de l'article.
  addColumn('purchase_items', 'product_color_id', 'INTEGER');
  addColumn('sync_queue', 'last_error', 'TEXT');

  // Reprise de l'historique : coût de revient manquant sur les anciennes lignes de vente.
  try {
    db.exec(`
      UPDATE sale_items
      SET unit_cost_snapshot = COALESCE((SELECT p.price_achat FROM products p WHERE p.id = sale_items.product_id), 0)
      WHERE unit_cost_snapshot = 0
    `);
  } catch {}

  // Un retour doit porter le même coût que la ligne de vente d'origine.
  try {
    db.exec(`
      UPDATE return_items
      SET unit_cost_snapshot = COALESCE((SELECT si.unit_cost_snapshot FROM sale_items si WHERE si.id = return_items.sale_item_id), 0)
      WHERE unit_cost_snapshot = 0
    `);
  } catch {}

  // Déduplication des permissions avant l'application de la contrainte UNIQUE(user_id, module).
  try {
    db.exec(`
      DELETE FROM permissions
      WHERE id NOT IN (SELECT MAX(id) FROM permissions GROUP BY user_id, module)
    `);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_user_module ON permissions(user_id, module)');
  } catch {}

  // Chaque utilisateur doit posséder une ligne de permission par module connu.
  try {
    const users = db.prepare('SELECT id, role FROM users').all() as any[];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO permissions (user_id, module, can_view, can_edit) VALUES (?, ?, ?, ?)'
    );
    for (const u of users) {
      const role = (u.role in DEFAULT_ROLE_PERMISSIONS ? u.role : 'cashier') as keyof typeof DEFAULT_ROLE_PERMISSIONS;
      for (const row of permissionMatrixToRows(DEFAULT_ROLE_PERMISSIONS[role])) {
        insert.run(u.id, row.module, row.canView ? 1 : 0, row.canEdit ? 1 : 0);
      }
    }
  } catch (err) {
    console.warn('[migration] permissions par défaut:', (err as Error).message);
  }

  // Cohérence des statuts de vente selon les retours réellement enregistrés.
  try {
    db.exec(`
      UPDATE sales SET status = 'completed'
      WHERE status = 'returned'
        AND EXISTS (
          SELECT 1 FROM sale_items si
          WHERE si.sale_id = sales.id
            AND si.qty > COALESCE((SELECT SUM(ri.qty_returned) FROM return_items ri WHERE ri.sale_item_id = si.id), 0)
        )
        AND NOT EXISTS (SELECT 1 FROM return_items ri JOIN sale_items si2 ON ri.sale_item_id = si2.id WHERE si2.sale_id = sales.id)
    `);
  } catch {}

  db.pragma('user_version = 4');
}

function seedLocalData(db: Database.Database) {
  const storeCount = db.prepare('SELECT COUNT(*) as cnt FROM stores').get() as any;
  if (storeCount && storeCount.cnt > 0) return; // base déjà initialisée : on n'écrase jamais les données du magasin

  const seed = db.transaction(() => {
    const insertStore = db.prepare('INSERT INTO stores (id, name, address, phone) VALUES (?, ?, ?, ?)');
    insertStore.run(1, 'Boutique Centre-Ville (Store 1)', 'Rue Didouche Mourad, Alger', '0550 11 22 33');
    insertStore.run(2, 'Boutique Zone Industrielle (Store 2)', "Zone d'Activité Oued Smar, Alger", '0550 44 55 66');

    const insertSetting = db.prepare(`
      INSERT INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSetting.run(1, 'Pièces Cycles & Motos - Centre', 'Rue Didouche Mourad, Alger', '0550 11 22 33', 'none', '', 'Merci pour votre confiance ! Pièces garanties.', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');
    insertSetting.run(2, 'Pièces Cycles & Motos - Dépôt', "Zone d'Activité Oued Smar, Alger", '0550 44 55 66', 'none', '', 'Merci pour votre confiance !', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');

    const passAdmin = bcrypt.hashSync('admin123', 10);
    const passSeller = bcrypt.hashSync('vendeur123', 10);

    const insertUser = db.prepare('INSERT INTO users (id, store_id, full_name, username, password_hash, is_active, role) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertUser.run(1, null, 'Propriétaire Gérant', 'admin', passAdmin, 1, 'owner');
    insertUser.run(2, 1, 'Vendeur Magasin 1', 'vendeur1', passSeller, 1, 'cashier');
    insertUser.run(3, 2, 'Vendeur Magasin 2', 'vendeur2', passSeller, 1, 'cashier');

    const insertPerm = db.prepare('INSERT OR REPLACE INTO permissions (user_id, module, can_view, can_edit) VALUES (?, ?, ?, ?)');
    const applyRole = (userId: number, role: keyof typeof DEFAULT_ROLE_PERMISSIONS) => {
      for (const row of permissionMatrixToRows(DEFAULT_ROLE_PERMISSIONS[role])) {
        insertPerm.run(userId, row.module, row.canView ? 1 : 0, row.canEdit ? 1 : 0);
      }
    };
    applyRole(1, 'owner');
    applyRole(2, 'cashier');
    applyRole(3, 'cashier');

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
      { id: 1, name: "BOUGIE D'ALLUMAGE IRIDIUM NGK CR8EIX", cat: 1, brand: 4, pAchat: 75000, pDet: 140000, pSemi: 120000, pGros: 105000, colorId: null, location: 'A-01', stock1: 45, stock2: 30, motos: [1, 2, 3, 4, 10] },
      { id: 2, name: 'KIT CHAINE RENFORCE O-RING 428-130L DID', cat: 5, brand: 1, pAchat: 350000, pDet: 550000, pSemi: 480000, pGros: 420000, colorId: null, location: 'B-03', stock1: 18, stock2: 12, motos: [1, 2, 4] },
      { id: 3, name: 'PLAQUETTES DE FREIN AVANT CERAMIQUE BREMBO', cat: 2, brand: 3, pAchat: 120000, pDet: 220000, pSemi: 190000, pGros: 170000, colorId: null, location: 'A-05', stock1: 25, stock2: 15, motos: [1, 2, 3] },
      { id: 4, name: 'CYLINDRE PISTON COMPLET 150CC CG125', cat: 1, brand: 9, pAchat: 420000, pDet: 680000, pSemi: 590000, pGros: 520000, colorId: null, location: 'C-02', stock1: 14, stock2: 10, motos: [1, 2, 8, 9] },
      { id: 5, name: 'HUILE MOTEUR SYNTHESE MOTUL 7100 10W40 (1L)', cat: 8, brand: 5, pAchat: 95000, pDet: 160000, pSemi: 140000, pGros: 125000, colorId: null, location: 'D-01', stock1: 50, stock2: 40, motos: [36] },
      { id: 6, name: 'PNEU ARRIERE TUBELESS 130/70-12 KENDA', cat: 6, brand: 6, pAchat: 380000, pDet: 580000, pSemi: 520000, pGros: 460000, colorId: null, location: 'P-04', stock1: 12, stock2: 8, motos: [10, 11, 12, 13] },
      { id: 7, name: 'CARENAGE FACE AVANT NOIR BRILLANT VMS CUXI', cat: 7, brand: 8, pAchat: 280000, pDet: 450000, pSemi: 390000, pGros: 350000, colorId: 1, location: 'CR-01', stock1: 8, stock2: 5, motos: [10] },
      { id: 8, name: 'CARENAGE LATERAL BLANC SYM SYMPHONY ST', cat: 7, brand: 2, pAchat: 320000, pDet: 520000, pSemi: 460000, pGros: 410000, colorId: 2, location: 'CR-02', stock1: 6, stock2: 4, motos: [11] },
      { id: 9, name: 'RETROVISEURS UNIVERSELS CARBONE CNC (PAIRE)', cat: 7, brand: 10, pAchat: 150000, pDet: 260000, pSemi: 220000, pGros: 190000, colorId: 1, location: 'AC-03', stock1: 15, stock2: 10, motos: [36] },
      { id: 10, name: 'FILTRE A AIR RACING MOUSSE FOX / 103', cat: 1, brand: 10, pAchat: 45000, pDet: 85000, pSemi: 70000, pGros: 60000, colorId: null, location: 'A-08', stock1: 30, stock2: 20, motos: [14, 15] },
      { id: 11, name: 'DEMARREUR ELECTRIQUE RENFORCE CG125/150', cat: 1, brand: 9, pAchat: 290000, pDet: 460000, pSemi: 400000, pGros: 360000, colorId: null, location: 'C-05', stock1: 10, stock2: 6, motos: [1, 2] },
      { id: 12, name: 'AMORTISSEUR ARRIERE REGLABLE GAZ 320MM', cat: 7, brand: 8, pAchat: 480000, pDet: 750000, pSemi: 660000, pGros: 590000, colorId: 21, location: 'S-02', stock1: 8, stock2: 5, motos: [1, 2, 10] },
      { id: 13, name: 'DISQUE DE FREIN AVANT WAVE 260MM', cat: 2, brand: 3, pAchat: 260000, pDet: 420000, pSemi: 360000, pGros: 320000, colorId: null, location: 'A-06', stock1: 12, stock2: 8, motos: [10, 11] },
      { id: 14, name: 'CASQUE INTEGRAL SPORT NOIR MAT TAILLE L', cat: 4, brand: 8, pAchat: 650000, pDet: 1100000, pSemi: 950000, pGros: 850000, colorId: 1, location: 'CS-01', stock1: 7, stock2: 4, motos: [36] },
      { id: 15, name: 'COURROIE TRANSMISSION RENFORCEE BANDO', cat: 5, brand: 2, pAchat: 180000, pDet: 310000, pSemi: 270000, pGros: 240000, colorId: null, location: 'B-01', stock1: 20, stock2: 15, motos: [10, 11] },
      { id: 16, name: 'CABLE ACCELERATEUR + GAINE TEFLON CG125', cat: 1, brand: 9, pAchat: 35000, pDet: 70000, pSemi: 55000, pGros: 45000, colorId: null, location: 'CB-02', stock1: 40, stock2: 25, motos: [1, 2] }
    ];

    const insertProd = db.prepare('INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode, location, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertBarcode = db.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
    const insertProdColor = db.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
    const insertCompat = db.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
    const insertStock = db.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
    const insertMovement = db.prepare('INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, user_id, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    for (const p of sampleProducts) {
      insertProd.run(p.id, formatProductCode(p.id), p.name, p.cat, p.brand, p.pAchat, p.pDet, p.pSemi, p.pGros, 'single', p.location, 5);
      insertBarcode.run(p.id, generateBarcodeValue(p.id), 'auto');
      if (p.colorId) insertProdColor.run(p.id, p.colorId, null);
      for (const mid of p.motos) insertCompat.run(p.id, mid);

      insertStock.run(p.id, 1, p.stock1);
      insertStock.run(p.id, 2, p.stock2);
      insertMovement.run(p.id, 1, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock1, p.stock1, p.pAchat, 1, 'initial_stock', null);
      insertMovement.run(p.id, 2, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock2, p.stock2, p.pAchat, 1, 'initial_stock', null);
    }

    const insertClient = db.prepare('INSERT INTO clients (id, name, phone, address, is_fidele, credit_limit) VALUES (?, ?, ?, ?, ?, ?)');
    insertClient.run(1, 'Mourad Moto Express', '0555 12 34 56', 'Kouba, Alger', 1, 10000000);
    insertClient.run(2, 'Atelier Réparation Karim', '0661 98 76 54', 'Bab El Oued, Alger', 1, 15000000);
    insertClient.run(3, 'Amine Coursier', '0770 45 67 89', 'Hydra, Alger', 0, 5000000);

    db.prepare('INSERT INTO client_transactions (id, client_id, type, amount, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 2, 'achat', 3500000, 'Solde initial reporté', 1);

    const insertSupplier = db.prepare('INSERT INTO suppliers (id, name, phone, address) VALUES (?, ?, ?, ?)');
    insertSupplier.run(1, 'Importateur Pièces Moto Alger (SARL Mototech)', '023 50 60 70', 'Zone Industrielle Rouiba');
    insertSupplier.run(2, 'Grossiste Accessoires & Casques Algérie', '021 66 77 88', 'El Eulma / Alger');
    insertSupplier.run(3, 'Distributeur Huiles & Pneumatiques DZ', '025 40 30 20', 'Blida');

    db.prepare('INSERT INTO supplier_transactions (id, supplier_id, type, amount, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, 1, 'achat', 15000000, 'Facture arrivage container #CT-2026-08', 1);

    const insertExpCat = db.prepare('INSERT INTO expense_categories (id, name) VALUES (?, ?)');
    const expenseCategories: Array<[number, string]> = [
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
  });

  seed();
}

/** Valeurs par défaut rejouables sans risque à chaque démarrage. */
function seedDefaults(db: Database.Database) {
  const shortcutCount = db.prepare('SELECT COUNT(*) as cnt FROM keyboard_shortcuts').get() as any;
  if (!shortcutCount || shortcutCount.cnt === 0) {
    const insertShortcut = db.prepare('INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?, ?)');
    const defaultShortcuts: Array<[string, string]> = [
      ['goto_pos', 'F1'], ['goto_produits', 'F2'], ['goto_stock', 'F3'], ['goto_achat', 'F4'],
      ['goto_clients', 'F5'], ['goto_fournisseurs', 'F6'], ['goto_rapport', 'F7'], ['goto_depenses', 'F8'],
      ['goto_settings', 'F9'], ['goto_journal', 'F10'], ['goto_users', 'F11'],
      ['confirm', 'Enter'], ['cancel', 'Escape'], ['retour', 'Control+R'], ['edit_product', 'Control+E'],
      ['add_product', 'Control+N'], ['search', 'Control+F'], ['clear_cart', 'Control+D'],
      ['print_receipt', 'Control+P'], ['toggle_price_tier', 'Control+T'], ['save', 'Control+S'],
      ['toggle_session', 'Control+Shift+S']
    ];
    for (const [action, shortcut] of defaultShortcuts) insertShortcut.run(action, shortcut);
  }

  const installDateRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('first_install_date') as any;
  if (!installDateRow) {
    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run('first_install_date', Date.now().toString());
  }

  const deviceRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('device_id') as any;
  if (!deviceRow) {
    const deviceId = `POS-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run('device_id', deviceId);
  }
}

export function getDeviceId(): string {
  const conn = getLocalDb();
  const row = conn.prepare('SELECT value FROM app_config WHERE key = ?').get('device_id') as any;
  return row?.value || 'POS-UNKNOWN';
}
