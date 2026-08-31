import bcrypt from 'bcryptjs';
import { getDb } from './index';
import { 
  SEEDED_COLORS, 
  DEFAULT_MOTORCYCLE_MODELS, 
  SYSTEM_MODULES, 
  STOCK_MOVEMENT_CODES, 
  formatProductCode, 
  generateBarcodeValue 
} from '@gestion-veloo/shared';

export async function runSeed() {
  const { rawDb, isPg } = getDb();
  console.log('🌱 Starting database seed...');

  if (!isPg) {
    // 1. Seed Stores
    const insertStore = rawDb.prepare(`
      INSERT OR IGNORE INTO stores (id, name, address, phone, logo_url)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStore.run(1, 'Boutique Centre-Ville (Store 1)', 'Rue Didouche Mourad, Alger', '0550 11 22 33', null);
    insertStore.run(2, 'Boutique Zone Industrielle (Store 2)', 'Zone d\'Activité Oued Smar, Alger', '0550 44 55 66', null);

    // 2. Seed Settings
    const insertSetting = rawDb.prepare(`
      INSERT OR IGNORE INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSetting.run(1, 'Pièces Cycles & Motos - Centre', 'Rue Didouche Mourad, Alger', '0550 11 22 33', 'none', '', 'Merci pour votre confiance ! Pièces garanties.', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');
    insertSetting.run(2, 'Pièces Cycles & Motos - Dépôt', 'Zone d\'Activité Oued Smar, Alger', '0550 44 55 66', 'none', '', 'Merci pour votre confiance !', 0, '099816000000000', '0001160000000', '16/00-0123456B', '1600000000');

    // 3. Seed Users
    const passwordHashAdmin = bcrypt.hashSync('admin123', 10);
    const passwordHashSeller = bcrypt.hashSync('vendeur123', 10);

    const insertUser = rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, store_id, full_name, username, password_hash, is_active, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(1, null, 'Propriétaire Gérant', 'admin', passwordHashAdmin, 1, 'owner');
    insertUser.run(2, 1, 'Vendeur Magasin 1', 'vendeur1', passwordHashSeller, 1, 'cashier');
    insertUser.run(3, 2, 'Vendeur Magasin 2', 'vendeur2', passwordHashSeller, 1, 'cashier');

    // 4. Seed Permissions
    const insertPerm = rawDb.prepare(`
      INSERT OR IGNORE INTO permissions (user_id, module, can_view, can_edit)
      VALUES (?, ?, ?, ?)
    `);
    for (const mod of SYSTEM_MODULES) {
      insertPerm.run(1, mod, 1, 1);
    }
    for (const userId of [2, 3]) {
      insertPerm.run(userId, 'pos', 1, 1);
      insertPerm.run(userId, 'clients', 1, 1);
      insertPerm.run(userId, 'fournisseurs', 1, 0);
      insertPerm.run(userId, 'produits', 1, 1);
      insertPerm.run(userId, 'stock', 1, 1);
      insertPerm.run(userId, 'achat', 1, 1);
      insertPerm.run(userId, 'rapport', 1, 0);
      insertPerm.run(userId, 'zakat', 0, 0);
      insertPerm.run(userId, 'settings', 1, 0);
      insertPerm.run(userId, 'users', 0, 0);
    }

    // 5. Seed Colors
    const insertColor = rawDb.prepare(`INSERT OR IGNORE INTO colors (id, name, hex_code) VALUES (?, ?, ?)`);
    SEEDED_COLORS.forEach((c, idx) => {
      insertColor.run(idx + 1, c.name, c.hexCode);
    });

    // 6. Seed Motorcycle Models
    const insertMoto = rawDb.prepare(`INSERT OR IGNORE INTO motorcycle_models (id, name) VALUES (?, ?)`);
    DEFAULT_MOTORCYCLE_MODELS.forEach((m, idx) => {
      insertMoto.run(idx + 1, m);
    });

    // 7. Seed Categories & Brands
    const categoriesList = ['Moteur & Cylindres', 'Freinage & Disques', 'Éclairage & Optiques', 'Casques & Équipements', 'Transmission & Chaînes', 'Pneus & Chambres à air', 'Carrosserie & Carénage', 'Huiles & Entretien', 'Guidons & Commandes', 'Batteries & Électricité'];
    const insertCat = rawDb.prepare(`INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`);
    categoriesList.forEach((c, idx) => insertCat.run(idx + 1, c));

    const brandsList = ['Yamaha Genuine', 'SYM Original', 'Brembo', 'NGK', 'Motul', 'Kenda', 'Michelin', 'VMS Racing', 'Haodjin OEM', 'Generic Parts', 'Yuasa', 'Castrol'];
    const insertBrand = rawDb.prepare(`INSERT OR IGNORE INTO brands (id, name) VALUES (?, ?)`);
    brandsList.forEach((b, idx) => insertBrand.run(idx + 1, b));

    // 8. Seed Sample Products (15 realistic motorcycle / bicycle parts)
    const sampleProducts = [
      { id: 1, name: 'Plaquettes de Frein Avant Céramique', cat: 2, brand: 3, pAchat: 120000, pDet: 220000, pSemi: 190000, pGros: 170000, colorMode: 'single', colorId: 10, stock1: 25, stock2: 15, motos: [1, 2, 3] },
      { id: 2, name: 'Kit Chaîne Renforcé O-Ring 428-130L', cat: 5, brand: 1, pAchat: 350000, pDet: 550000, pSemi: 480000, pGros: 420000, colorMode: 'single', colorId: 77, stock1: 18, stock2: 12, motos: [1, 2, 4] },
      { id: 3, name: 'Casque Intégral Bicolore Sport GT', cat: 4, brand: 8, pAchat: 650000, pDet: 1100000, pSemi: 950000, pGros: 850000, colorMode: 'merged', colorIds: [1, 21], stock1: 8, stock2: 6, motos: [36] },
      { id: 4, name: 'Cylindre Piston Complet 150cc CG', cat: 1, brand: 9, pAchat: 420000, pDet: 680000, pSemi: 590000, pGros: 520000, colorMode: 'single', colorId: 10, stock1: 14, stock2: 10, motos: [1, 2, 8, 9] },
      { id: 5, name: 'Feu Arrière LED Fumée + Clignotants Intégrés', cat: 3, brand: 10, pAchat: 180000, pDet: 320000, pSemi: 280000, pGros: 240000, colorMode: 'variants', colorIds: [21, 35, 1], stock1: 30, stock2: 20, motos: [1, 3, 10] },
      { id: 6, name: 'Huile Moteur Synthèse 10W40 4T (1L)', cat: 8, brand: 5, pAchat: 95000, pDet: 160000, pSemi: 140000, pGros: 125000, colorMode: 'single', colorId: 78, stock1: 50, stock2: 40, motos: [36] },
      { id: 7, name: 'Pneu Arrière Tubeless 130/70-12', cat: 6, brand: 6, pAchat: 380000, pDet: 580000, pSemi: 520000, pGros: 460000, colorMode: 'single', colorId: 1, stock1: 12, stock2: 8, motos: [10, 11, 12, 13] },
      { id: 8, name: 'Bougie d\'Allumage Iridium CR8EIX', cat: 1, brand: 4, pAchat: 75000, pDet: 140000, pSemi: 120000, pGros: 105000, colorMode: 'single', colorId: 12, stock1: 45, stock2: 30, motos: [1, 2, 3, 4, 10] },
      { id: 9, name: 'Batterie Gel 12V 7Ah YTX7L-BS', cat: 10, brand: 11, pAchat: 260000, pDet: 420000, pSemi: 370000, pGros: 330000, colorMode: 'single', colorId: 1, stock1: 20, stock2: 15, motos: [1, 5, 8, 11] },
      { id: 10, name: 'Levier de Frein Hydraulique Réglable CNC', cat: 9, brand: 8, pAchat: 140000, pDet: 250000, pSemi: 220000, pGros: 195000, colorMode: 'variants', colorIds: [1, 21, 35], stock1: 16, stock2: 12, motos: [1, 2, 3, 5] },
      { id: 11, name: 'Amortisseur Arrière Gaz Renforcé 320mm', cat: 7, brand: 8, pAchat: 580000, pDet: 890000, pSemi: 780000, pGros: 700000, colorMode: 'single', colorId: 21, stock1: 10, stock2: 8, motos: [1, 2, 4] },
      { id: 12, name: 'Carburateur PZ27 Starter Manuel 125/150cc', cat: 1, brand: 9, pAchat: 290000, pDet: 480000, pSemi: 420000, pGros: 370000, colorMode: 'single', colorId: 10, stock1: 15, stock2: 10, motos: [1, 2, 8] }
    ];

    const insertProd = rawDb.prepare(`
      INSERT OR IGNORE INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBarcode = rawDb.prepare(`INSERT OR IGNORE INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)`);
    const insertProdColor = rawDb.prepare(`INSERT OR IGNORE INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)`);
    const insertCompat = rawDb.prepare(`INSERT OR IGNORE INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)`);
    const insertStock = rawDb.prepare(`INSERT OR IGNORE INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)`);
    const insertMovement = rawDb.prepare(`
      INSERT OR IGNORE INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of sampleProducts) {
      insertProd.run(p.id, formatProductCode(p.id), p.name, p.cat, p.brand, p.pAchat, p.pDet, p.pSemi, p.pGros, p.colorMode);
      insertBarcode.run(p.id, generateBarcodeValue(p.id), 'auto');

      if (p.colorMode === 'single' && p.colorId) {
        insertProdColor.run(p.id, p.colorId, null);
      } else if (p.colorMode === 'merged' && p.colorIds) {
        for (const cid of p.colorIds) {
          insertProdColor.run(p.id, cid, `merge-${p.id}`);
        }
      } else if (p.colorMode === 'variants' && p.colorIds) {
        for (const cid of p.colorIds) {
          insertProdColor.run(p.id, cid, null);
        }
      }

      for (const mid of p.motos) {
        insertCompat.run(p.id, mid);
      }

      insertStock.run(p.id, 1, p.stock1);
      insertStock.run(p.id, 2, p.stock2);

      // Code 90 entry for clear visual audit trail
      insertMovement.run(p.id, 1, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock1, p.stock1, 1, 'initial_stock', null);
      insertMovement.run(p.id, 2, STOCK_MOVEMENT_CODES.ACHAT, 0, p.stock2, p.stock2, 1, 'initial_stock', null);
    }

    // 9. Seed Clients
    const insertClient = rawDb.prepare(`
      INSERT OR IGNORE INTO clients (id, name, phone, address, is_fidele, credit_limit)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertClient.run(1, 'Mourad Moto Express', '0555 12 34 56', 'Kouba, Alger', 1, 10000000);
    insertClient.run(2, 'Atelier Réparation Karim', '0661 98 76 54', 'Bab El Oued, Alger', 1, 15000000);
    insertClient.run(3, 'Amine Coursier', '0770 45 67 89', 'Hydra, Alger', 0, 5000000);
    insertClient.run(4, 'Garage Mohamed Cycles', '0550 88 77 66', 'Oued Smar, Alger', 1, 12000000);

    // 10. Seed Suppliers
    const insertSupplier = rawDb.prepare(`
      INSERT OR IGNORE INTO suppliers (id, name, phone, address)
      VALUES (?, ?, ?, ?)
    `);
    insertSupplier.run(1, 'Importateur Pièces Moto Alger (SARL Mototech)', '023 50 60 70', 'Zone Industrielle Rouiba');
    insertSupplier.run(2, 'Grossiste Accessoires & Casques Algérie', '021 66 77 88', 'El Eulma / Alger');
    insertSupplier.run(3, 'Distributeur Huiles & Pneumatiques DZ', '025 40 30 20', 'Blida');

    // Clean any old dummy sales or transactions on startup so the web only reflects real desktop POS sync data
    rawDb.exec(`
      DELETE FROM sale_items WHERE sale_id IN (1, 2, 3);
      DELETE FROM sales WHERE id IN (1, 2, 3);
      DELETE FROM client_transactions WHERE id IN (1, 2);
      DELETE FROM supplier_transactions WHERE id = 1;
    `);

    console.log('✅ Base de données initialisée proprement (0 ventes factices — prête pour la synchronisation réelle).');
  }
}

if (require.main === module) {
  runSeed();
}
