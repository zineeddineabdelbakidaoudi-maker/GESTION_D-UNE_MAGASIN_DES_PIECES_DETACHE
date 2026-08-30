import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { createProductSchema } from '@gestion-veloo/shared';
import { formatProductCode, generateBarcodeValue } from '@gestion-veloo/shared';
import { STOCK_MOVEMENT_CODES } from '@gestion-veloo/shared';

const router = Router();

// GET /api/products (Full search with motor compat, colors, barcodes)
router.get('/', authenticateToken, requirePermission('produits', 'view'), (req: AuthRequest, res: Response) => {
  const { q, categoryId, brandId, motorcycleModelId, storeId } = req.query;
  const { rawDb, isPg } = getDb();

  if (isPg) return res.json([]);

  let sql = `
    SELECT DISTINCT p.*, 
      c.name as category_name, 
      b.name as brand_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_barcodes pb ON p.id = pb.product_id
    LEFT JOIN product_motorcycle_compat pmc ON p.id = pmc.product_id
    LEFT JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (q) {
    sql += ` AND (
      LOWER(p.name) LIKE ? OR 
      LOWER(p.code) LIKE ? OR 
      LOWER(pb.barcode_value) LIKE ? OR 
      LOWER(b.name) LIKE ? OR
      LOWER(mm.name) LIKE ?
    )`;
    const like = `%${(q as string).toLowerCase()}%`;
    params.push(like, like, like, like, like);
  }
  if (categoryId) {
    sql += ` AND p.category_id = ?`;
    params.push(categoryId);
  }
  if (brandId) {
    sql += ` AND p.brand_id = ?`;
    params.push(brandId);
  }
  if (motorcycleModelId) {
    sql += ` AND pmc.motorcycle_model_id = ?`;
    params.push(motorcycleModelId);
  }

  sql += ` ORDER BY p.id DESC`;

  const products = rawDb.prepare(sql).all(...params) as any[];

  // Attach barcodes, colors, compat, and stock
  const result = products.map(prod => {
    const barcodes = rawDb.prepare('SELECT * FROM product_barcodes WHERE product_id = ?').all(prod.id);
    const colors = rawDb.prepare(`
      SELECT pc.*, c.name as color_name, c.hex_code 
      FROM product_colors pc 
      JOIN colors c ON pc.color_id = c.id 
      WHERE pc.product_id = ?
    `).all(prod.id);
    const compat = rawDb.prepare(`
      SELECT mm.* 
      FROM product_motorcycle_compat pmc 
      JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id 
      WHERE pmc.product_id = ?
    `).all(prod.id);

    let stockQuery = 'SELECT ps.*, s.name as store_name FROM product_stock ps JOIN stores s ON ps.store_id = s.id WHERE ps.product_id = ?';
    const stockParams = [prod.id];
    if (storeId) {
      stockQuery += ' AND ps.store_id = ?';
      stockParams.push(storeId as any);
    }
    const stock = rawDb.prepare(stockQuery).all(...stockParams);

    return {
      ...prod,
      barcodes,
      colors,
      compatibleModels: compat,
      stock
    };
  });

  res.json(result);
});

// POST /api/products (Create with 3 color modes)
router.post('/', authenticateToken, requirePermission('produits', 'edit'), (req: AuthRequest, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const data = parsed.data;
  const { rawDb } = getDb();

  try {
    // Generate next product ID and code
    const maxIdRow = rawDb.prepare('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM products').get() as any;
    const nextId = maxIdRow.next_id;
    const code = formatProductCode(nextId);

    // Insert Product
    const insertProd = rawDb.prepare(`
      INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProd.run(
      nextId,
      code,
      data.name,
      data.categoryId || null,
      data.brandId || null,
      data.priceAchat,
      data.priceDetail,
      data.priceSemiGros || data.priceDetail,
      data.priceGros || data.priceDetail,
      data.colorMode,
      data.location || ''
    );

    // Barcodes (up to 5)
    const barcodesToInsert = data.barcodes && data.barcodes.length > 0 ? data.barcodes : [generateBarcodeValue(nextId)];
    const insertBc = rawDb.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
    for (const bc of barcodesToInsert.slice(0, 5)) {
      insertBc.run(nextId, bc, 'auto');
    }

    // 3 Color Modes
    const insertColor = rawDb.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
    if (data.colorMode === 'single' && data.colorIds && data.colorIds.length > 0) {
      insertColor.run(nextId, data.colorIds[0], null);
    } else if (data.colorMode === 'variants' && data.colorIds) {
      for (const cid of data.colorIds) {
        insertColor.run(nextId, cid, null);
      }
    } else if (data.colorMode === 'merged' && data.mergeColorIds) {
      const mergeGroupId = `merge-${nextId}-${Date.now()}`;
      for (const cid of data.mergeColorIds) {
        insertColor.run(nextId, cid, mergeGroupId);
      }
    }

    // Motorcycle Compatibility
    if (data.compatibleModelIds) {
      const insertCompat = rawDb.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
      for (const mid of data.compatibleModelIds) {
        insertCompat.run(nextId, mid);
      }
    }

    // Initialize Stock per store
    const stores = rawDb.prepare('SELECT id FROM stores').all() as any[];
    const insertStock = rawDb.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
    const insertMovement = rawDb.prepare(`
      INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, user_id, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'initial_stock', NULL)
    `);

    for (const s of stores) {
      const qty = data.initialStock && data.initialStock[s.id.toString()] ? data.initialStock[s.id.toString()] : 0;
      insertStock.run(nextId, s.id, qty);
      if (qty > 0) {
        insertMovement.run(nextId, s.id, STOCK_MOVEMENT_CODES.ACHAT, 0, qty, qty, req.user?.id || 1);
      }
    }

    res.status(201).json({ id: nextId, code, ...data });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la création du produit', details: err.message });
  }
});

// PUT /api/products/:id (Update product)
router.put('/:id', authenticateToken, requirePermission('produits', 'edit'), (req: AuthRequest, res: Response) => {
  const productId = parseInt(req.params.id, 10);
  const data = req.body;
  const { rawDb } = getDb();

  try {
    // Read avg_price_mode from settings
    const settings = rawDb.prepare('SELECT avg_price_mode FROM settings WHERE store_id = 1').get() as any;
    const avgPriceMode = settings ? settings.avg_price_mode : 1;

    let finalPriceAchat = data.priceAchat;
    if (avgPriceMode === 1) {
      const existing = rawDb.prepare('SELECT price_achat FROM products WHERE id = ?').get(productId) as any;
      if (existing && existing.price_achat > 0 && data.priceAchat !== existing.price_achat) {
        finalPriceAchat = Math.round((existing.price_achat + data.priceAchat) / 2);
      }
    }

    rawDb.prepare(`
      UPDATE products SET name=?, category_id=?, brand_id=?, price_achat=?, price_detail=?, price_semi_gros=?, price_gros=?, color_mode=?, location=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.name,
      data.categoryId || null,
      data.brandId || null,
      finalPriceAchat,
      data.priceDetail,
      data.priceSemiGros || data.priceDetail,
      data.priceGros || data.priceDetail,
      data.colorMode || 'single',
      data.location || '',
      productId
    );

    // Update colors
    rawDb.prepare('DELETE FROM product_colors WHERE product_id = ?').run(productId);
    const insertColor = rawDb.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
    if (data.colorMode === 'single' && data.colorIds && data.colorIds.length > 0) {
      insertColor.run(productId, data.colorIds[0], null);
    } else if (data.colorMode === 'variants' && data.colorIds) {
      for (const cid of data.colorIds) insertColor.run(productId, cid, null);
    } else if (data.colorMode === 'merged' && data.mergeColorIds) {
      const mergeGroupId = `merge-${productId}-${Date.now()}`;
      for (const cid of data.mergeColorIds) insertColor.run(productId, cid, mergeGroupId);
    }

    // Update motorcycle compat
    rawDb.prepare('DELETE FROM product_motorcycle_compat WHERE product_id = ?').run(productId);
    if (data.compatibleModelIds && data.compatibleModelIds.length > 0) {
      const insertCompat = rawDb.prepare('INSERT INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
      for (const mid of data.compatibleModelIds) insertCompat.run(productId, mid);
    }

    // Update barcodes
    if (data.barcodes && data.barcodes.length > 0) {
      rawDb.prepare('DELETE FROM product_barcodes WHERE product_id = ?').run(productId);
      const insertBarcode = rawDb.prepare('INSERT INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
      for (const bc of data.barcodes.slice(0, 5)) insertBarcode.run(productId, bc, 'manual');
    }

    res.json({ success: true, id: productId, finalPriceAchat });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du produit', details: err.message });
  }
});

export default router;
