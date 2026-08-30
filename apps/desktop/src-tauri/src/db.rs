use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

pub fn init_db() -> Connection {
    let data_dir = PathBuf::from("data");
    if !data_dir.exists() {
        let _ = fs::create_dir_all(&data_dir);
    }
    let db_path = data_dir.join("pos_local.sqlite");
    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

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
            article_imposition TEXT DEFAULT ''
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

        -- Performance Indexes
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
        ",
    )
    .expect("Failed to initialize database tables and indexes");

    seed_database(&conn);

    conn
}

fn seed_database(conn: &Connection) {
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM stores")
        .expect("Failed to check stores");
    let count: i64 = stmt.query_row([], |r| r.get(0)).unwrap_or(0);
    if count > 0 {
        return;
    }

    // Seed Stores
    let _ = conn.execute(
        "INSERT INTO stores (id, name, address, phone) VALUES 
        (1, 'Boutique Centre-Ville (Store 1)', 'Rue Didouche Mourad, Alger', '0550 11 22 33'),
        (2, 'Boutique Zone Industrielle (Store 2)', 'Zone d''Activité Oued Smar, Alger', '0550 44 55 66')",
        [],
    );

    // Seed Settings
    let _ = conn.execute(
        "INSERT INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition) VALUES 
        (1, 'Pièces Cycles & Motos - Centre', 'Rue Didouche Mourad, Alger', '0550 11 22 33', 'none', '', 'Merci de votre visite et à bientôt !', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000'),
        (2, 'Pièces Cycles & Motos - Dépôt', 'Zone d''Activité Oued Smar, Alger', '0550 44 55 66', 'none', '', 'Merci de votre visite et à bientôt !', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000')",
        [],
    );

    // Seed Users (admin, vendeur1, vendeur2)
    let hash = "$2a$10$wT0X8G1U4Y1rZgG4V.F5h.h8vK6YhBqjFp9kZ3WvT8F.f4kU1xSia"; // bcrypt 'admin123'
    let _ = conn.execute(
        "INSERT INTO users (id, store_id, full_name, username, password_hash, role) VALUES 
        (1, NULL, 'Propriétaire Gérant', 'admin', ?1, 'owner'),
        (2, 1, 'Vendeur Magasin 1', 'vendeur1', ?1, 'cashier'),
        (3, 2, 'Vendeur Magasin 2', 'vendeur2', ?1, 'cashier')",
        params![hash],
    );

    // Seed Permissions
    let modules = [
        "pos", "clients", "fournisseurs", "produits", "stock", "achat", "rapport", "zakat",
        "settings", "users",
    ];
    for u in 1..=3 {
        for m in &modules {
            let can_v = if u == 1 { 1 } else { 1 };
            let can_e = if u == 1 { 1 } else { 1 };
            let _ = conn.execute(
                "INSERT INTO permissions (user_id, module, can_view, can_edit) VALUES (?1, ?2, ?3, ?4)",
                params![u, m, can_v, can_e],
            );
        }
    }

    // Seed Categories
    let cats = [
        "Freinage & Disques", "Transmission & Chaînes", "Pneumatiques & Chambres",
        "Moteur & Cylindres", "Éclairage & Optiques", "Huiles & Entretien",
        "Casques & Équipements", "Guidons & Commandes"
    ];
    for c in &cats {
        let _ = conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?1)", params![c]);
    }

    // Seed Brands
    let brands = ["NGK", "Brembo", "DID", "Kenda", "Michelin", "Motul", "Haodjin OEM", "Generic Parts", "VMS Racing"];
    for b in &brands {
        let _ = conn.execute("INSERT OR IGNORE INTO brands (name) VALUES (?1)", params![b]);
    }

    // Seed Motorcycle Models
    let motos = [
        "Haodjin 125 Lion", "Haodjin 150 Eagle", "VMS Driver 125", "VMS Cuxi 110",
        "Yamaha YBR 125", "Yamaha DT 125", "Honda CG 125", "Honda C90",
        "Kymco Agility 50", "SYM Symphony 150", "Peugeot 103 SP", "MBK 51 Club"
    ];
    for m in &motos {
        let _ = conn.execute("INSERT OR IGNORE INTO motorcycle_models (name) VALUES (?1)", params![m]);
    }

    // Seed Colors (135 catalog)
    let colors = [
        ("Noir", "#000000"), ("Blanc", "#FFFFFF"), ("Rouge", "#FF0000"), ("Bleu", "#0000FF"),
        ("Jaune", "#FFFF00"), ("Vert", "#008000"), ("Gris Nardo", "#757B82"), ("Gris Argent", "#C0C0C0"),
        ("Orange KTM", "#FF6600"), ("Bleu Yamaha Racing", "#002B7F"), ("Vert Kawasaki", "#70C21A"),
        ("Noir Mat", "#1A1A1A"), ("Rouge Mat", "#8B0000"), ("Bleu Nuit", "#191970")
    ];
    for (name, hex) in &colors {
        let _ = conn.execute("INSERT OR IGNORE INTO colors (name, hex_code) VALUES (?1, ?2)", params![name, hex]);
    }

    // Seed Initial Products
    let prods = [
        (1, "ART-00001", "Plaquettes de Frein Avant Céramique", 1, 2, 120000, 220000, 180000, 150000, "single", "200000000013"),
        (2, "ART-00002", "Kit Chaîne Renforcé 428H-118L", 2, 3, 350000, 550000, 480000, 420000, "single", "200000000020"),
        (3, "ART-00003", "Casque Intégral Bicolore Sport GT", 7, 9, 650000, 1100000, 950000, 850000, "merged", "200000000037"),
        (4, "ART-00004", "Cylindre Piston Complet 150cc CG", 4, 7, 420000, 680000, 580000, 500000, "single", "200000000044"),
        (5, "ART-00005", "Feu Arrière LED Fumée + Clignotants", 5, 8, 180000, 320000, 270000, 230000, "single", "200000000051"),
        (6, "ART-00006", "Huile Moteur Synthèse 10W40 4T (1L)", 6, 6, 95000, 160000, 135000, 120000, "single", "200000000068"),
        (7, "ART-00007", "Pneu Arrière Tubeless 130/70-12", 3, 4, 380000, 580000, 500000, 450000, "single", "200000000075"),
        (8, "ART-00008", "Bougie d'Allumage Iridium CR8EIX", 4, 1, 75000, 140000, 110000, 95000, "single", "200000000082")
    ];

    for (id, code, name, cat_id, brand_id, pa, pd, psg, pg, mode, bc) in &prods {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, code, name, cat_id, brand_id, pa, pd, psg, pg, mode],
        );

        let _ = conn.execute(
            "INSERT OR IGNORE INTO product_barcodes (product_id, barcode_value, source) VALUES (?1, ?2, 'auto')",
            params![id, bc],
        );

        let _ = conn.execute(
            "INSERT OR IGNORE INTO product_colors (product_id, color_id) VALUES (?1, 1)",
            params![id],
        );

        let _ = conn.execute(
            "INSERT OR IGNORE INTO product_stock (product_id, store_id, quantity) VALUES (?1, 1, 15), (?1, 2, 8)",
            params![id],
        );

        let _ = conn.execute(
            "INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type)
             VALUES (?1, 1, 90, 0, 15, 15, 1, 'purchase'), (?1, 2, 90, 0, 8, 8, 1, 'purchase')",
            params![id],
        );
    }

    // Seed Clients & Suppliers
    let _ = conn.execute(
        "INSERT INTO clients (id, name, phone, address, is_fidele, credit_limit) VALUES 
        (1, 'Karim Boudiaf (Atelier Moto)', '0551 22 33 44', 'Bab El Oued, Alger', 1, 10000000),
        (2, 'Mourad Cycles Express', '0662 33 44 55', 'Hussein Dey, Alger', 0, 5000000)",
        [],
    );

    let _ = conn.execute(
        "INSERT INTO suppliers (id, name, phone, address) VALUES 
        (1, 'SARL Moto Pièces Import', '021 55 66 77', 'Zone Industrielle Oued Smar, Alger'),
        (2, 'ETS Cycles & Accessoires Maghreb', '021 88 99 00', 'Blida')",
        [],
    );
}
