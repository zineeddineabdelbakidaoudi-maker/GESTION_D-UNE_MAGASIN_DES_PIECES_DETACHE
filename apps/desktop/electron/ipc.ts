import { ipcMain, IpcMainInvokeEvent } from 'electron';
// @ts-ignore - bwip-js n'expose pas de types ESM
import bwipjs from 'bwip-js';
import bcrypt from 'bcryptjs';
import {
  STOCK_MOVEMENT_CODES,
  SYSTEM_MODULES,
  USER_ROLES,
  MODULE_LABELS,
  calculateTrialState,
  formatProductCode,
  generateBarcodeValue,
  resolvePurchaseCost,
  diffRecords,
  can,
  type SystemModule,
  type UserRole
} from '@gestion-veloo/shared';
import { getLocalDb, getDeviceId } from './db';
import { formatThermalReceiptText } from './printer';
import { recordAudit, queryAudit, auditStats } from './audit';
import {
  login,
  logout,
  requireSession,
  peekSession,
  assertPermission,
  resolveStoreScope,
  requireWritableStore,
  sessionActor,
  refreshSessionPermissions,
  changePassword,
  validatePasswordStrength,
  defaultPermissionsFor,
  toPublicSession,
  AuthError,
  PermissionError,
  type Session
} from './session';

const BUILD_TIME = process.env.BUILD_TIME ? parseInt(process.env.BUILD_TIME, 10) : Date.now();

type Action = 'view' | 'edit';

interface Ctx {
  db: ReturnType<typeof getLocalDb>;
  session: Session;
  actor: ReturnType<typeof sessionActor>;
  /** Boutique imposée par le rôle pour les lectures (null = toutes). */
  scopeStore: (requested?: number | null) => number | null;
  /** Boutique autorisée en écriture. */
  writeStore: (requested?: number | null) => number;
}

/**
 * Enregistre un canal IPC protégé.
 *  - exige une session valide,
 *  - vérifie la permission module/action,
 *  - normalise les erreurs renvoyées au renderer.
 * Aucun canal métier n'est exposé sans passer par ici.
 */
function secure<T>(
  channel: string,
  guard: { module: SystemModule; action: Action } | null,
  handler: (ctx: Ctx, payload: any, event: IpcMainInvokeEvent) => T
) {
  ipcMain.handle(channel, (event, payload) => {
    try {
      const session = requireSession(event.sender.id);
      if (guard) assertPermission(session, guard.module, guard.action);

      const db = getLocalDb();
      const ctx: Ctx = {
        db,
        session,
        actor: sessionActor(session),
        scopeStore: (requested) => resolveStoreScope(session, requested),
        writeStore: (requested) => requireWritableStore(session, requested)
      };
      return handler(ctx, payload, event);
    } catch (err: any) {
      throw normalizeError(err, channel);
    }
  });
}

/** Canal accessible sans session (écran de connexion, licence). */
function open<T>(channel: string, handler: (payload: any, event: IpcMainInvokeEvent) => T) {
  ipcMain.handle(channel, (event, payload) => {
    try {
      return handler(payload, event);
    } catch (err: any) {
      throw normalizeError(err, channel);
    }
  });
}

function normalizeError(err: any, channel: string): Error {
  const code = err?.code || (err instanceof AuthError ? err.code : undefined);
  const message = err?.message || 'Erreur inattendue';
  if (!(err instanceof AuthError) && !(err instanceof PermissionError)) {
    console.error(`[ipc:${channel}]`, err);
  }
  const out = new Error(code ? `${code}::${message}` : message);
  return out;
}

function int(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function positiveInt(v: any, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Valeur invalide pour « ${field} ».`);
  return Math.round(n);
}

function text(v: any, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/** Un utilisateur ne voit les coûts d'achat que s'il a accès au module Achat. */
function canSeeCost(session: Session): boolean {
  return can(session, 'achat', 'view') || can(session, 'rapport', 'view');
}

function storeSettings(db: ReturnType<typeof getLocalDb>, storeId: number) {
  const row = db.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId) as any;
  return {
    costThreshold: row?.cost_threshold ?? 5,
    lowStockAlert: row?.low_stock_alert ?? 5,
    allowNegativeStock: Boolean(row?.allow_negative_stock),
    avgPriceMode: row?.avg_price_mode ?? 1,
    raw: row
  };
}

export function registerIpcHandlers() {
  const db = getLocalDb();

  // ───────────────────────────── Licence & amorçage ─────────────────────────────

  open('get-trial-status', () => {
    try {
      const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('first_install_date') as any;
      if (row?.value) return calculateTrialState(parseInt(row.value, 10));
    } catch {}
    return calculateTrialState(BUILD_TIME);
  });

  /** Données strictement publiques nécessaires à l'écran de connexion. */
  open('get-bootstrap', () => {
    const stores = db.prepare('SELECT id, name, address, phone FROM stores ORDER BY id ASC').all();
    const hasUsers = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_active = 1').get() as any)?.cnt ?? 0;
    return { stores, deviceId: getDeviceId(), hasUsers: hasUsers > 0 };
  });

  // ───────────────────────────── Authentification ─────────────────────────────

  open('auth-login', (payload, event) => {
    const { session, store, stores } = login(event.sender.id, payload?.username, payload?.password);
    return {
      user: toPublicSession(session),
      store,
      stores,
      capabilities: { canSeeCost: canSeeCost(session) }
    };
  });

  open('auth-session', (_payload, event) => {
    const session = peekSession(event.sender.id);
    if (!session) return null;
    const stores = db.prepare('SELECT * FROM stores ORDER BY id ASC').all() as any[];
    const store = session.storeId ? stores.find(s => s.id === session.storeId) || null : stores[0] || null;
    return {
      user: toPublicSession(session),
      store,
      stores,
      capabilities: { canSeeCost: canSeeCost(session) }
    };
  });

  open('auth-logout', (_payload, event) => {
    logout(event.sender.id);
    return { success: true };
  });

  secure('auth-change-password', null, (ctx, payload) => {
    changePassword(ctx.session, payload?.currentPassword, payload?.newPassword);
    return { success: true };
  });

  // ───────────────────────────── Utilitaires ─────────────────────────────

  secure('generate-barcode-image', null, async (_ctx, textValue: string) => {
    const value = text(textValue);
    if (!value) throw new Error('Code-barres vide.');
    const pngBuffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center'
    });
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  });

  secure('print-receipt', { module: 'pos', action: 'view' }, (ctx, payload: any) => {
    const receiptText = formatThermalReceiptText(payload);
    console.log('--- TICKET THERMIQUE 80MM (ESC/POS) ---');
    console.log(receiptText);
    return { success: true, receiptText };
  });

  secure('get-metadata', null, (ctx) => {
    const categories = ctx.db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    const brands = ctx.db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
    const colors = ctx.db.prepare('SELECT * FROM colors ORDER BY id ASC').all();
    const motorcycleModels = ctx.db.prepare('SELECT * FROM motorcycle_models ORDER BY name ASC').all();
    const stores = ctx.db.prepare('SELECT * FROM stores ORDER BY id ASC').all();
    return { categories, brands, colors, motorcycleModels, stores };
  });

  // ───────────────────────────── Produits ─────────────────────────────

  secure('get-products', { module: 'produits', action: 'view' }, (ctx, params: any) => {
    const { q, categoryId, colorId, sort, includeArchived } = params || {};
    const storeId = ctx.scopeStore(params?.storeId);
    const showCost = canSeeCost(ctx.session);

    let sql = `
      SELECT DISTINCT p.*, c.name as categoryName, b.name as brandName
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN product_barcodes pb ON p.id = pb.product_id
      LEFT JOIN product_motorcycle_compat pmc ON p.id = pmc.product_id
      LEFT JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id
      LEFT JOIN product_colors pc ON p.id = pc.product_id
      WHERE 1=1
    `;
    const args: any[] = [];

    if (!includeArchived) sql += ' AND p.is_archived = 0';
    if (q) {
      sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(pb.barcode_value) LIKE ? OR LOWER(b.name) LIKE ? OR LOWER(mm.name) LIKE ?)';
      const like = `%${String(q).toLowerCase()}%`;
      args.push(like, like, like, like, like);
    }
    if (categoryId) { sql += ' AND p.category_id = ?'; args.push(categoryId); }
    if (colorId) { sql += ' AND pc.color_id = ?'; args.push(colorId); }
    sql += ` ORDER BY ${sort === 'az' ? 'p.name ASC' : 'p.id DESC'}`;

    const rows = ctx.db.prepare(sql).all(...args) as any[];

    const barcodeStmt = ctx.db.prepare('SELECT id, barcode_value as barcodeValue, source FROM product_barcodes WHERE product_id = ?');
    const colorStmt = ctx.db.prepare(`
      SELECT pc.id, pc.color_id as colorId, pc.merge_group_id as mergeGroupId, c.name, c.hex_code as hexCode
      FROM product_colors pc JOIN colors c ON pc.color_id = c.id WHERE pc.product_id = ?
    `);
    const compatStmt = ctx.db.prepare(`
      SELECT mm.id, mm.name FROM product_motorcycle_compat pmc
      JOIN motorcycle_models mm ON pmc.motorcycle_model_id = mm.id WHERE pmc.product_id = ?
    `);

    return rows.map(p => {
      const stockArgs: any[] = [p.id];
      let stockSql = 'SELECT store_id as storeId, quantity FROM product_stock WHERE product_id = ?';
      if (storeId) { stockSql += ' AND store_id = ?'; stockArgs.push(storeId); }
      const stock = ctx.db.prepare(stockSql).all(...stockArgs) as any[];
      const totalStock = stock.reduce((sum, s) => sum + (s.quantity || 0), 0);

      return {
        ...p,
        price_achat: showCost ? p.price_achat : null,
        priceAchat: showCost ? p.price_achat : null,
        priceDetail: p.price_detail,
        priceSemiGros: p.price_semi_gros,
        priceGros: p.price_gros,
        colorMode: p.color_mode,
        location: p.location || '',
        minStock: p.min_stock ?? 0,
        isArchived: Boolean(p.is_archived),
        barcodes: barcodeStmt.all(p.id),
        colors: colorStmt.all(p.id),
        compatibleModels: compatStmt.all(p.id),
        stock,
        totalStock
      };
    });
  });

  secure('create-product', { module: 'produits', action: 'edit' }, (ctx, payload: any) => {
    const name = text(payload?.name);
    if (!name) throw new Error('Le nom de l\'article est obligatoire.');

    return ctx.db.transaction(() => {
      const maxRow = ctx.db.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM products').get() as any;
      let nextId = (maxRow?.maxId || 0) + 1;
      while (ctx.db.prepare('SELECT id FROM products WHERE id = ?').get(nextId)) nextId++;

      const custom = text(payload?.customCode).toUpperCase();
      let code = custom || formatProductCode(nextId);
      if (custom) {
        if (ctx.db.prepare('SELECT id FROM products WHERE code = ?').get(code)) {
          throw new Error(`Code article déjà utilisé : ${code}`);
        }
      } else {
        let candidate = nextId;
        while (ctx.db.prepare('SELECT id FROM products WHERE code = ?').get(code)) {
          candidate++;
          code = formatProductCode(candidate);
        }
      }

      const priceAchat = int(payload?.priceAchat);
      ctx.db.prepare(`
        INSERT INTO products (id, code, name, category_id, brand_id, price_achat, price_detail, price_semi_gros, price_gros, color_mode, location, unit, photo_base64, min_stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextId, code, name, payload?.categoryId || null, payload?.brandId || null,
        priceAchat, int(payload?.priceDetail), int(payload?.priceSemiGros), int(payload?.priceGros),
        payload?.colorMode || 'single', text(payload?.location), text(payload?.unit, 'PCS') || 'PCS',
        payload?.photoBase64 || null, int(payload?.minStock)
      );

      if (text(payload?.location)) {
        ctx.db.prepare('INSERT OR IGNORE INTO saved_locations (location) VALUES (?)').run(text(payload.location));
      }

      const barcodes: string[] = payload?.barcodes?.length ? payload.barcodes : [generateBarcodeValue(nextId)];
      const insertBarcode = ctx.db.prepare('INSERT OR IGNORE INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
      for (const bc of barcodes.slice(0, 5)) insertBarcode.run(nextId, bc, payload?.barcodes?.length ? 'manual' : 'auto');

      applyProductColors(ctx.db, nextId, payload);
      applyProductCompat(ctx.db, nextId, payload?.compatibleModelIds);

      const stores = ctx.db.prepare('SELECT id FROM stores').all() as any[];
      const insertStock = ctx.db.prepare('INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)');
      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, 0, ?, ?, ?, 'Stock initial à la création de l''article', ?, 'initial_stock', NULL)
      `);

      let seeded = 0;
      for (const s of stores) {
        const qty = int(payload?.initialStock?.[String(s.id)]);
        insertStock.run(nextId, s.id, qty);
        if (qty > 0) {
          insertMovement.run(nextId, s.id, STOCK_MOVEMENT_CODES.ACHAT, qty, qty, priceAchat, ctx.session.userId);
          seeded += qty;
        }
      }

      if (priceAchat > 0) {
        ctx.db.prepare(`
          INSERT INTO product_cost_history (product_id, store_id, previous_cost, incoming_cost, new_cost, stock_before, strategy, reason, ref_type, ref_id, user_id)
          VALUES (?, NULL, 0, ?, ?, 0, 'initial', 'Prix d''achat défini à la création de l''article.', 'product', ?, ?)
        `).run(nextId, priceAchat, priceAchat, nextId, ctx.session.userId);
      }

      recordAudit({
        actor: ctx.actor,
        action: 'product.created',
        module: 'produits',
        entityType: 'product',
        entityId: nextId,
        summary: `Article créé : ${code} — ${name}`,
        storeId: ctx.session.storeId,
        metadata: { code, name, priceAchat, priceDetail: int(payload?.priceDetail), stockInitial: seeded }
      }, ctx.db);

      return { id: nextId, code };
    })();
  });

  secure('update-product', { module: 'produits', action: 'edit' }, (ctx, payload: any) => {
    const id = positiveInt(payload?.id, 'article');

    return ctx.db.transaction(() => {
      const before = ctx.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
      if (!before) throw new Error('Article introuvable.');

      // Le prix d'achat ne se modifie ici que manuellement et explicitement :
      // la règle « stock < 5 » s'applique aux réceptions d'achat, pas aux corrections de fiche.
      const priceAchat = payload?.priceAchat === undefined || payload?.priceAchat === null
        ? before.price_achat
        : int(payload.priceAchat);

      ctx.db.prepare(`
        UPDATE products SET name=?, category_id=?, brand_id=?, price_achat=?, price_detail=?, price_semi_gros=?, price_gros=?,
               color_mode=?, location=?, unit=?, min_stock=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        text(payload?.name, before.name) || before.name,
        payload?.categoryId ?? null,
        payload?.brandId ?? null,
        priceAchat,
        int(payload?.priceDetail, before.price_detail),
        int(payload?.priceSemiGros, before.price_semi_gros),
        int(payload?.priceGros, before.price_gros),
        payload?.colorMode || before.color_mode,
        text(payload?.location, before.location),
        text(payload?.unit, before.unit) || 'PCS',
        payload?.minStock === undefined ? before.min_stock : int(payload.minStock),
        id
      );

      applyProductColors(ctx.db, id, payload);
      if (payload?.compatibleModelIds !== undefined) applyProductCompat(ctx.db, id, payload.compatibleModelIds);

      if (payload?.barcodes?.length) {
        ctx.db.prepare('DELETE FROM product_barcodes WHERE product_id = ?').run(id);
        const insertBarcode = ctx.db.prepare('INSERT OR IGNORE INTO product_barcodes (product_id, barcode_value, source) VALUES (?, ?, ?)');
        for (const bc of payload.barcodes.slice(0, 5)) insertBarcode.run(id, bc, 'manual');
      }

      if (text(payload?.location)) {
        ctx.db.prepare('INSERT OR IGNORE INTO saved_locations (location) VALUES (?)').run(text(payload.location));
      }
      if (payload?.photoBase64) {
        ctx.db.prepare('UPDATE products SET photo_base64 = ? WHERE id = ?').run(payload.photoBase64, id);
      }

      const after = ctx.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
      const labels: Record<string, string> = {
        name: 'Désignation', price_achat: "Prix d'achat", price_detail: 'Prix détail',
        price_semi_gros: 'Prix semi-gros', price_gros: 'Prix gros', location: 'Emplacement',
        unit: 'Unité', min_stock: 'Stock minimum', category_id: 'Catégorie', brand_id: 'Marque'
      };
      const tracked = ['name', 'price_achat', 'price_detail', 'price_semi_gros', 'price_gros', 'location', 'unit', 'min_stock', 'category_id', 'brand_id'];
      const pick = (o: any) => Object.fromEntries(tracked.map(k => [k, o[k]]));
      const changes = diffRecords(pick(before), pick(after), labels);

      if (changes.length) {
        const priceChanged = changes.some(c => c.field.startsWith('price_'));
        recordAudit({
          actor: ctx.actor,
          action: priceChanged ? 'product.price.changed' : 'product.updated',
          module: 'produits',
          entityType: 'product',
          entityId: id,
          summary: `Article ${before.code} modifié (${changes.map(c => c.label).join(', ')}).`,
          changes,
          storeId: ctx.session.storeId
        }, ctx.db);
      }

      return { success: true, id, priceAchat: after.price_achat, changes: changes.length };
    })();
  });

  secure('update-product-photo', { module: 'produits', action: 'edit' }, (ctx, payload: any) => {
    const id = positiveInt(payload?.productId, 'article');
    ctx.db.prepare('UPDATE products SET photo_base64 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(payload?.photoBase64 || null, id);
    recordAudit({
      actor: ctx.actor, action: 'product.photo.updated', module: 'produits',
      entityType: 'product', entityId: id, summary: `Photo mise à jour pour l'article #${id}.`,
      storeId: ctx.session.storeId
    }, ctx.db);
    return { success: true };
  });

  secure('archive-product', { module: 'produits', action: 'edit' }, (ctx, payload: any) => {
    const id = positiveInt(payload?.id, 'article');
    const archived = payload?.archived === false ? 0 : 1;
    const product = ctx.db.prepare('SELECT code, name FROM products WHERE id = ?').get(id) as any;
    if (!product) throw new Error('Article introuvable.');

    ctx.db.prepare('UPDATE products SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(archived, id);
    recordAudit({
      actor: ctx.actor, action: 'product.updated', module: 'produits', entityType: 'product', entityId: id,
      summary: `Article ${product.code} ${archived ? 'archivé' : 'réactivé'}.`,
      severity: 'notice', storeId: ctx.session.storeId
    }, ctx.db);
    return { success: true };
  });

  secure('get-cost-history', { module: 'produits', action: 'view' }, (ctx, payload: any) => {
    if (!canSeeCost(ctx.session)) throw new PermissionError('Accès refusé : consultation des prix d\'achat non autorisée.');
    const productId = positiveInt(payload?.productId, 'article');
    return ctx.db.prepare(`
      SELECT h.*, u.full_name as userName, s.name as storeName
      FROM product_cost_history h
      LEFT JOIN users u ON h.user_id = u.id
      LEFT JOIN stores s ON h.store_id = s.id
      WHERE h.product_id = ?
      ORDER BY h.id DESC LIMIT 100
    `).all(productId);
  });

  // ───────────────────────────── Stock ─────────────────────────────

  secure('get-stock', { module: 'stock', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const showCost = canSeeCost(ctx.session);
    const args: any[] = [];

    let sql = `
      SELECT p.id as productId, p.code as productCode, p.name as productName,
             p.price_achat as priceAchat, p.price_detail as priceDetail, p.min_stock as minStock,
             p.unit as unit, p.location as location,
             c.name as categoryName, b.name as brandName,
             ps.store_id as storeId, s.name as storeName, ps.quantity as quantity
      FROM products p
      JOIN product_stock ps ON p.id = ps.product_id
      JOIN stores s ON ps.store_id = s.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.is_archived = 0
    `;
    if (storeId) { sql += ' AND ps.store_id = ?'; args.push(storeId); }
    if (params?.q) {
      sql += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.code) LIKE ? OR LOWER(b.name) LIKE ?)';
      const like = `%${String(params.q).toLowerCase()}%`;
      args.push(like, like, like);
    }
    if (params?.lowOnly) sql += ' AND ps.quantity <= MAX(p.min_stock, 0)';
    sql += ' ORDER BY p.id DESC';

    const rows = ctx.db.prepare(sql).all(...args) as any[];
    const lastMoveStmt = ctx.db.prepare(`
      SELECT movement_code, qty_before, qty_after, delta, created_at
      FROM stock_movements WHERE product_id = ? AND store_id = ? ORDER BY id DESC LIMIT 1
    `);

    return rows.map(r => {
      const lm = lastMoveStmt.get(r.productId, r.storeId) as any;
      return {
        ...r,
        priceAchat: showCost ? r.priceAchat : null,
        stockValue: showCost ? r.quantity * r.priceAchat : null,
        isLow: r.minStock > 0 && r.quantity <= r.minStock,
        lastMovementCode: lm?.movement_code ?? null,
        hasRecentMovement: Boolean(lm),
        isCode90Recent: lm?.movement_code === STOCK_MOVEMENT_CODES.ACHAT,
        recentQtyBefore: lm ? lm.qty_before : null,
        recentQtyAfter: lm ? lm.qty_after : null,
        lastMovementDate: lm?.created_at ?? null
      };
    });
  });

  secure('adjust-stock', { module: 'stock', action: 'edit' }, (ctx, payload: any) => {
    const productId = positiveInt(payload?.productId, 'article');
    const storeId = ctx.writeStore(payload?.storeId);
    const newQuantity = int(payload?.newQuantity);
    const note = text(payload?.note);
    if (newQuantity < 0) throw new Error('Une quantité de stock ne peut pas être négative.');
    if (!note) throw new Error('Un motif est obligatoire pour tout ajustement de stock.');

    return ctx.db.transaction(() => {
      const current = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, storeId) as any;
      const qtyBefore = current ? current.quantity : 0;
      const delta = newQuantity - qtyBefore;
      if (delta === 0) return { success: true, productId, storeId, qtyBefore, newQuantity, delta: 0 };

      const product = ctx.db.prepare('SELECT code, name, price_achat FROM products WHERE id = ?').get(productId) as any;
      if (!product) throw new Error('Article introuvable.');

      ctx.db.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `).run(productId, storeId, newQuantity);

      ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'adjustment', NULL)
      `).run(productId, storeId, STOCK_MOVEMENT_CODES.AJUSTEMENT, qtyBefore, newQuantity, delta, product.price_achat, note, ctx.session.userId);

      recordAudit({
        actor: ctx.actor,
        action: 'stock.adjusted',
        module: 'stock',
        entityType: 'product',
        entityId: productId,
        storeId,
        summary: `Ajustement ${product.code} : ${qtyBefore} → ${newQuantity} (${delta > 0 ? '+' : ''}${delta}). Motif : ${note}`,
        changes: [{ field: 'quantity', label: 'Quantité', before: qtyBefore, after: newQuantity }],
        metadata: { note, delta, valueImpact: delta * (product.price_achat || 0) }
      }, ctx.db);

      return { success: true, productId, storeId, qtyBefore, newQuantity, delta, note };
    })();
  });

  secure('transfer-stock', { module: 'stock', action: 'edit' }, (ctx, payload: any) => {
    const productId = positiveInt(payload?.productId, 'article');
    const qty = positiveInt(payload?.qty, 'quantité');
    const fromStoreId = ctx.writeStore(payload?.fromStoreId);
    const toStoreId = positiveInt(payload?.toStoreId, 'boutique de destination');
    if (fromStoreId === toStoreId) throw new Error('Les boutiques source et destination doivent être différentes.');

    return ctx.db.transaction(() => {
      const src = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, fromStoreId) as any;
      const srcQty = src ? src.quantity : 0;
      if (srcQty < qty) throw new Error(`Stock insuffisant : ${srcQty} disponible(s) dans la boutique source.`);

      const dst = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(productId, toStoreId) as any;
      const dstQty = dst ? dst.quantity : 0;
      const product = ctx.db.prepare('SELECT code, name, price_achat FROM products WHERE id = ?').get(productId) as any;

      ctx.db.prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND store_id = ?').run(srcQty - qty, productId, fromStoreId);
      ctx.db.prepare(`
        INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
      `).run(productId, toStoreId, dstQty + qty);

      const transferId = Number(ctx.db.prepare(
        'INSERT INTO stock_transfers (from_store_id, to_store_id, product_id, qty, user_id, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(fromStoreId, toStoreId, productId, qty, ctx.session.userId, text(payload?.note) || null).lastInsertRowid);

      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'transfer', ?)
      `);
      insertMovement.run(productId, fromStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_SORTANT, srcQty, srcQty - qty, -qty, product?.price_achat || 0, text(payload?.note) || null, ctx.session.userId, transferId);
      insertMovement.run(productId, toStoreId, STOCK_MOVEMENT_CODES.TRANSFERT_ENTRANT, dstQty, dstQty + qty, qty, product?.price_achat || 0, text(payload?.note) || null, ctx.session.userId, transferId);

      recordAudit({
        actor: ctx.actor,
        action: 'stock.transferred',
        module: 'stock',
        entityType: 'stock_transfer',
        entityId: transferId,
        storeId: fromStoreId,
        summary: `Transfert de ${qty} × ${product?.code} : boutique ${fromStoreId} → ${toStoreId}.`,
        metadata: { productId, qty, fromStoreId, toStoreId, note: text(payload?.note) }
      }, ctx.db);

      return { success: true, transferId };
    })();
  });

  secure('get-stock-movements', { module: 'stock', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const limit = Math.min(int(params?.limit, 100) || 100, 1000);
    const args: any[] = [];

    let sql = `
      SELECT sm.*, p.name as productName, p.code as productCode, u.full_name as userName, s.name as storeName
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
      JOIN stores s ON sm.store_id = s.id
      WHERE 1=1
    `;
    if (storeId) { sql += ' AND sm.store_id = ?'; args.push(storeId); }
    if (params?.productId) { sql += ' AND sm.product_id = ?'; args.push(params.productId); }
    if (params?.movementCode) {
      if (int(params.movementCode) === 94) {
        sql += ' AND sm.movement_code IN (94, 95)';
      } else {
        sql += ' AND sm.movement_code = ?';
        args.push(int(params.movementCode));
      }
    }
    if (params?.dateFrom) { sql += ' AND date(sm.created_at) >= date(?)'; args.push(params.dateFrom); }
    if (params?.dateTo) { sql += ' AND date(sm.created_at) <= date(?)'; args.push(params.dateTo); }
    sql += ' ORDER BY sm.id DESC LIMIT ?';
    args.push(limit);

    return ctx.db.prepare(sql).all(...args);
  });

  secure('get-low-stock', { module: 'stock', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const settings = storeSettings(ctx.db, storeId || 1);
    const args: any[] = [settings.lowStockAlert];
    let sql = `
      SELECT p.id as productId, p.code, p.name, p.min_stock as minStock, ps.quantity, ps.store_id as storeId, s.name as storeName
      FROM products p
      JOIN product_stock ps ON p.id = ps.product_id
      JOIN stores s ON ps.store_id = s.id
      WHERE p.is_archived = 0 AND ps.quantity <= (CASE WHEN p.min_stock > 0 THEN p.min_stock ELSE ? END)
    `;
    if (storeId) { sql += ' AND ps.store_id = ?'; args.push(storeId); }
    sql += ' ORDER BY ps.quantity ASC LIMIT 200';
    return ctx.db.prepare(sql).all(...args);
  });

  // ───────────────────────────── Ventes ─────────────────────────────

  secure('create-sale', { module: 'pos', action: 'edit' }, (ctx, payload: any) => {
    const storeId = ctx.writeStore(payload?.storeId);
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) throw new Error('Impossible de valider une vente sans article.');

    const settings = storeSettings(ctx.db, storeId);
    const paymentType = ['cash', 'credit', 'mixed'].includes(payload?.paymentType) ? payload.paymentType : 'cash';
    const clientId = payload?.clientId ? positiveInt(payload.clientId, 'client') : null;

    if ((paymentType === 'credit' || paymentType === 'mixed') && !clientId) {
      throw new Error('Une vente à crédit exige la sélection d\'un client.');
    }

    return ctx.db.transaction(() => {
      // Les prix et quantités sont revalidés ici : le renderer n'est jamais la source de vérité.
      let subtotal = 0;
      const lines = items.map(it => {
        const productId = positiveInt(it?.productId, 'article');
        const qty = positiveInt(it?.qty, 'quantité');
        const unitPrice = int(it?.unitPrice);
        if (unitPrice < 0) throw new Error('Prix de vente négatif refusé.');
        const product = ctx.db.prepare('SELECT id, code, name, price_achat FROM products WHERE id = ?').get(productId) as any;
        if (!product) throw new Error(`Article #${productId} introuvable.`);
        const lineTotal = qty * unitPrice;
        subtotal += lineTotal;
        return { productId, qty, unitPrice, lineTotal, product, priceTier: it?.priceTier || 'detail', productColorId: it?.productColorId || null };
      });

      const discount = Math.min(Math.max(int(payload?.discount), 0), subtotal);
      const total = subtotal - discount;
      const requestedPaid = int(payload?.amountPaid);
      const actualPaid = paymentType === 'credit' ? 0 : paymentType === 'mixed' ? Math.min(Math.max(requestedPaid, 0), total) : total;
      const amountCredit = total - actualPaid;

      if (amountCredit > 0 && clientId) {
        const client = ctx.db.prepare('SELECT name, credit_limit FROM clients WHERE id = ?').get(clientId) as any;
        if (!client) throw new Error('Client introuvable.');
        const debtRow = ctx.db.prepare(`
          SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
          FROM client_transactions WHERE client_id = ?
        `).get(clientId) as any;
        const projected = (debtRow?.debt || 0) + amountCredit;
        if (client.credit_limit > 0 && projected > client.credit_limit) {
          throw new Error(
            `Plafond de crédit dépassé pour ${client.name} : ${(projected / 100).toFixed(2)} DA demandés pour une limite de ${(client.credit_limit / 100).toFixed(2)} DA.`
          );
        }
      }

      const saleId = Number(ctx.db.prepare(`
        INSERT INTO sales (store_id, client_id, user_id, cash_session_id, subtotal, discount, total, amount_paid, amount_credit, payment_type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(storeId, clientId, ctx.session.userId, payload?.cashSessionId || null, subtotal, discount, total, actualPaid, amountCredit, paymentType).lastInsertRowid);

      const insertItem = ctx.db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_color_id, price_tier, qty, unit_price, unit_cost_snapshot, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'sale', ?)
      `);

      let totalCost = 0;
      for (const line of lines) {
        const stockRow = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(line.productId, storeId) as any;
        const qtyBefore = stockRow ? stockRow.quantity : 0;
        if (!settings.allowNegativeStock && qtyBefore < line.qty) {
          throw new Error(`Stock insuffisant pour « ${line.product.name} » : ${qtyBefore} en stock, ${line.qty} demandé(s).`);
        }
        const qtyAfter = qtyBefore - line.qty;

        // Coût figé au moment de la vente : une modification ultérieure du prix
        // d'achat ne peut plus altérer le bénéfice historique.
        const unitCost = line.product.price_achat || 0;
        totalCost += unitCost * line.qty;

        insertItem.run(saleId, line.productId, line.productColorId, line.priceTier, line.qty, line.unitPrice, unitCost, line.lineTotal);
        ctx.db.prepare(`
          INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
        `).run(line.productId, storeId, qtyAfter);
        insertMovement.run(line.productId, storeId, STOCK_MOVEMENT_CODES.VENTE, qtyBefore, qtyAfter, -line.qty, unitCost, ctx.session.userId, saleId);
      }

      if (amountCredit > 0 && clientId) {
        ctx.db.prepare('INSERT INTO client_transactions (client_id, type, amount, sale_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(clientId, 'achat', amountCredit, saleId, `Vente #${saleId} à crédit`, ctx.session.userId);
      }

      const margin = total - totalCost;
      recordAudit({
        actor: ctx.actor,
        action: 'sale.created',
        module: 'pos',
        entityType: 'sale',
        entityId: saleId,
        storeId,
        summary: `Vente #${saleId} : ${lines.length} ligne(s), total ${(total / 100).toFixed(2)} DA (${paymentType}).`,
        metadata: {
          subtotal, discount, total, amountPaid: actualPaid, amountCredit, paymentType, clientId,
          totalCost, margin, lines: lines.map(l => ({ code: l.product.code, qty: l.qty, unitPrice: l.unitPrice, unitCost: l.product.price_achat }))
        }
      }, ctx.db);

      enqueueSync(ctx.db, 'sale', saleId, 'create', { saleId, storeId, total, margin });

      return { saleId, total, subtotal, discount, amountPaid: actualPaid, amountCredit, margin };
    })();
  });

  secure('get-sales', { module: 'pos', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const showCost = canSeeCost(ctx.session);
    const args: any[] = [];

    let sql = `
      SELECT s.*, c.name as clientName, u.full_name as userName, st.name as storeName
      FROM sales s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      JOIN stores st ON s.store_id = st.id
      WHERE 1=1
    `;
    if (storeId) { sql += ' AND s.store_id = ?'; args.push(storeId); }
    if (params?.dateFrom) { sql += ' AND date(s.created_at) >= date(?)'; args.push(params.dateFrom); }
    if (params?.dateTo) { sql += ' AND date(s.created_at) <= date(?)'; args.push(params.dateTo); }
    if (params?.saleId) { sql += ' AND s.id = ?'; args.push(int(params.saleId)); }
    sql += ' ORDER BY s.id DESC LIMIT ?';
    args.push(Math.min(int(params?.limit, 300) || 300, 2000));

    const sales = ctx.db.prepare(sql).all(...args) as any[];
    const itemStmt = ctx.db.prepare(`
      SELECT si.*, p.name as productName, p.code as productCode,
             (si.qty - COALESCE((SELECT SUM(ri.qty_returned) FROM return_items ri WHERE ri.sale_item_id = si.id), 0)) as returnableQty
      FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?
    `);

    return sales.map(s => {
      const items = (itemStmt.all(s.id) as any[]).map(it => ({
        ...it,
        unit_cost_snapshot: showCost ? it.unit_cost_snapshot : null,
        margin: showCost ? (it.unit_price - it.unit_cost_snapshot) * it.qty : null
      }));
      const totalCost = items.reduce((sum, it) => sum + (it.unit_cost_snapshot || 0) * it.qty, 0);
      return { ...s, items, margin: showCost ? s.total - totalCost : null };
    });
  });

  secure('process-return', { module: 'pos', action: 'edit' }, (ctx, payload: any) => {
    const saleId = positiveInt(payload?.saleId, 'vente');
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    const reason = text(payload?.reason);
    if (!items.length) throw new Error('Aucune ligne à retourner.');
    if (!reason) throw new Error('Un motif de retour est obligatoire.');

    return ctx.db.transaction(() => {
      const sale = ctx.db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
      if (!sale) throw new Error('Vente introuvable.');
      const storeId = ctx.writeStore(sale.store_id);

      // Une remise globale se répercute proportionnellement sur le remboursement.
      const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;

      const returnId = Number(ctx.db.prepare(
        'INSERT INTO returns (sale_id, store_id, user_id, total_refund, reason) VALUES (?, ?, ?, 0, ?)'
      ).run(saleId, storeId, ctx.session.userId, reason).lastInsertRowid);

      const insertReturnItem = ctx.db.prepare(`
        INSERT INTO return_items (return_id, sale_item_id, qty_returned, unit_price, unit_cost_snapshot, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'return', ?)
      `);

      let totalRefund = 0;
      let returnedCost = 0;
      const detail: any[] = [];

      for (const it of items) {
        const saleItemId = positiveInt(it?.saleItemId, 'ligne de vente');
        const qtyReturned = positiveInt(it?.qtyReturned, 'quantité retournée');

        const saleItem = ctx.db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(saleItemId, saleId) as any;
        if (!saleItem) throw new Error(`Ligne de vente #${saleItemId} introuvable sur la vente #${saleId}.`);

        const already = (ctx.db.prepare('SELECT COALESCE(SUM(qty_returned), 0) as qty FROM return_items WHERE sale_item_id = ?').get(saleItemId) as any)?.qty || 0;
        const remaining = saleItem.qty - already;
        if (qtyReturned > remaining) {
          throw new Error(`Retour impossible : ${remaining} unité(s) restante(s) sur cette ligne, ${qtyReturned} demandée(s).`);
        }

        // Le prix remboursé provient de la vente enregistrée, jamais du client.
        const refundUnit = Math.round(saleItem.unit_price * ratio);
        const lineTotal = refundUnit * qtyReturned;
        totalRefund += lineTotal;
        returnedCost += saleItem.unit_cost_snapshot * qtyReturned;

        insertReturnItem.run(returnId, saleItemId, qtyReturned, refundUnit, saleItem.unit_cost_snapshot, lineTotal);

        const stockRow = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(saleItem.product_id, storeId) as any;
        const qtyBefore = stockRow ? stockRow.quantity : 0;
        const qtyAfter = qtyBefore + qtyReturned;

        ctx.db.prepare(`
          INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
        `).run(saleItem.product_id, storeId, qtyAfter);

        insertMovement.run(
          saleItem.product_id, storeId, STOCK_MOVEMENT_CODES.RETOUR, qtyBefore, qtyAfter, qtyReturned,
          saleItem.unit_cost_snapshot, reason, ctx.session.userId, returnId
        );

        const product = ctx.db.prepare('SELECT code FROM products WHERE id = ?').get(saleItem.product_id) as any;
        detail.push({ code: product?.code, qtyReturned, refundUnit, lineTotal });
      }

      ctx.db.prepare('UPDATE returns SET total_refund = ? WHERE id = ?').run(totalRefund, returnId);

      // Le crédit restant du client est soldé en priorité ; le reliquat est un remboursement en espèces.
      let creditOffset = 0;
      if (sale.client_id) {
        const outstanding = (ctx.db.prepare(`
          SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
          FROM client_transactions WHERE client_id = ?
        `).get(sale.client_id) as any)?.debt || 0;
        creditOffset = Math.max(0, Math.min(totalRefund, outstanding));
        if (creditOffset > 0) {
          ctx.db.prepare('INSERT INTO client_transactions (client_id, type, amount, sale_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
            .run(sale.client_id, 'versement', creditOffset, saleId, `Avoir sur retour #${returnId}`, ctx.session.userId);
        }
      }
      const cashRefund = totalRefund - creditOffset;

      // Statut réel : partiel tant qu'il reste des unités non retournées.
      const remainingRow = ctx.db.prepare(`
        SELECT COALESCE(SUM(si.qty - COALESCE((SELECT SUM(ri.qty_returned) FROM return_items ri WHERE ri.sale_item_id = si.id), 0)), 0) as remaining
        FROM sale_items si WHERE si.sale_id = ?
      `).get(saleId) as any;
      const status = (remainingRow?.remaining || 0) <= 0 ? 'returned' : 'partial_return';
      ctx.db.prepare('UPDATE sales SET status = ? WHERE id = ?').run(status, saleId);

      recordAudit({
        actor: ctx.actor,
        action: 'return.created',
        module: 'pos',
        entityType: 'return',
        entityId: returnId,
        storeId,
        summary: `Retour #${returnId} sur vente #${saleId} : ${(totalRefund / 100).toFixed(2)} DA remboursés. Motif : ${reason}`,
        metadata: { saleId, totalRefund, returnedCost, marginReversed: totalRefund - returnedCost, creditOffset, cashRefund, status, detail, reason }
      }, ctx.db);

      enqueueSync(ctx.db, 'return', returnId, 'create', { returnId, saleId, storeId, totalRefund });

      return { returnId, totalRefund, creditOffset, cashRefund, status };
    })();
  });

  secure('void-sale', { module: 'pos', action: 'edit' }, (ctx, payload: any) => {
    if (ctx.session.role !== 'owner' && ctx.session.role !== 'manager') {
      throw new PermissionError('Seuls le propriétaire et le gérant peuvent annuler une vente.');
    }
    const saleId = positiveInt(payload?.saleId, 'vente');
    const reason = text(payload?.reason);
    if (!reason) throw new Error('Un motif d\'annulation est obligatoire.');

    return ctx.db.transaction(() => {
      const sale = ctx.db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
      if (!sale) throw new Error('Vente introuvable.');
      if (sale.status === 'voided') throw new Error('Cette vente est déjà annulée.');
      const storeId = ctx.writeStore(sale.store_id);

      const items = ctx.db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId) as any[];
      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sale_void', ?)
      `);

      for (const it of items) {
        const already = (ctx.db.prepare('SELECT COALESCE(SUM(qty_returned), 0) as qty FROM return_items WHERE sale_item_id = ?').get(it.id) as any)?.qty || 0;
        const toRestore = it.qty - already;
        if (toRestore <= 0) continue;
        const stockRow = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(it.product_id, storeId) as any;
        const qtyBefore = stockRow ? stockRow.quantity : 0;
        ctx.db.prepare(`
          INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
        `).run(it.product_id, storeId, qtyBefore + toRestore);
        insertMovement.run(it.product_id, storeId, STOCK_MOVEMENT_CODES.RETOUR, qtyBefore, qtyBefore + toRestore, toRestore, it.unit_cost_snapshot, `Annulation vente #${saleId}`, ctx.session.userId, saleId);
      }

      if (sale.client_id && sale.amount_credit > 0) {
        ctx.db.prepare('INSERT INTO client_transactions (client_id, type, amount, sale_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(sale.client_id, 'versement', sale.amount_credit, saleId, `Annulation vente #${saleId}`, ctx.session.userId);
      }

      ctx.db.prepare("UPDATE sales SET status = 'voided' WHERE id = ?").run(saleId);

      recordAudit({
        actor: ctx.actor,
        action: 'sale.voided',
        module: 'pos',
        entityType: 'sale',
        entityId: saleId,
        storeId,
        summary: `Vente #${saleId} annulée par ${ctx.session.fullName}. Motif : ${reason}`,
        severity: 'critical',
        metadata: { saleId, total: sale.total, reason }
      }, ctx.db);

      return { success: true, saleId };
    })();
  });

  // ───────────────────────────── Achats ─────────────────────────────

  secure('create-purchase', { module: 'achat', action: 'edit' }, (ctx, payload: any) => {
    const storeId = ctx.writeStore(payload?.storeId);
    const supplierId = positiveInt(payload?.supplierId, 'fournisseur');
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) throw new Error('Impossible d\'enregistrer un bon d\'achat sans ligne.');

    const settings = storeSettings(ctx.db, storeId);

    return ctx.db.transaction(() => {
      const supplier = ctx.db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId) as any;
      if (!supplier) throw new Error('Fournisseur introuvable.');

      const lines = items.map(it => {
        const productId = positiveInt(it?.productId, 'article');
        const qty = positiveInt(it?.qty, 'quantité');
        const unitCost = int(it?.unitCost);
        if (unitCost < 0) throw new Error('Prix d\'achat négatif refusé.');
        const product = ctx.db.prepare('SELECT id, code, name, price_achat FROM products WHERE id = ?').get(productId) as any;
        if (!product) throw new Error(`Article #${productId} introuvable.`);
        return { productId, qty, unitCost, lineTotal: qty * unitCost, product };
      });

      const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
      const amountPaid = Math.min(Math.max(int(payload?.amountPaid), 0), total);
      const paymentType = ['cash', 'credit', 'mixed'].includes(payload?.paymentType) ? payload.paymentType : 'cash';

      const purchaseId = Number(ctx.db.prepare(
        'INSERT INTO purchases (store_id, supplier_id, user_id, total, amount_paid, payment_type, reference) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(storeId, supplierId, ctx.session.userId, total, amountPaid, paymentType, text(payload?.reference)).lastInsertRowid);

      const insertItem = ctx.db.prepare(`
        INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total, cost_strategy, cost_before, cost_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMovement = ctx.db.prepare(`
        INSERT INTO stock_movements (product_id, store_id, movement_code, qty_before, qty_after, delta, unit_cost, note, user_id, ref_type, ref_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'purchase', ?)
      `);
      const insertCostHistory = ctx.db.prepare(`
        INSERT INTO product_cost_history (product_id, store_id, previous_cost, incoming_cost, new_cost, stock_before, strategy, reason, ref_type, ref_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'purchase', ?, ?)
      `);

      const costReport: any[] = [];

      for (const line of lines) {
        const stockRow = ctx.db.prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND store_id = ?').get(line.productId, storeId) as any;
        const qtyBefore = stockRow ? stockRow.quantity : 0;
        const qtyAfter = qtyBefore + line.qty;

        // ► Règle métier : stock restant avant réception < seuil ⇒ le nouveau prix
        //   d'achat devient dominant ; sinon médiane ancien / nouveau.
        const resolution = resolvePurchaseCost({
          stockBefore: qtyBefore,
          currentCost: line.product.price_achat,
          incomingCost: line.unitCost,
          threshold: settings.costThreshold
        });

        ctx.db.prepare(`
          INSERT INTO product_stock (product_id, store_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(product_id, store_id) DO UPDATE SET quantity = excluded.quantity
        `).run(line.productId, storeId, qtyAfter);

        insertItem.run(purchaseId, line.productId, line.qty, line.unitCost, line.lineTotal, resolution.strategy, resolution.previousCost, resolution.newCost);
        insertMovement.run(
          line.productId, storeId, STOCK_MOVEMENT_CODES.ACHAT, qtyBefore, qtyAfter, line.qty,
          line.unitCost, text(payload?.reference) || null, ctx.session.userId, purchaseId
        );

        if (resolution.newCost !== resolution.previousCost) {
          ctx.db.prepare('UPDATE products SET price_achat = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(resolution.newCost, line.productId);
          insertCostHistory.run(
            line.productId, storeId, resolution.previousCost, line.unitCost, resolution.newCost,
            qtyBefore, resolution.strategy, resolution.reason, purchaseId, ctx.session.userId
          );
          recordAudit({
            actor: ctx.actor,
            action: 'product.cost.recalculated',
            module: 'achat',
            entityType: 'product',
            entityId: line.productId,
            storeId,
            summary: `${line.product.code} : prix d'achat ${(resolution.previousCost / 100).toFixed(2)} → ${(resolution.newCost / 100).toFixed(2)} DA. ${resolution.reason}`,
            changes: [{ field: 'price_achat', label: "Prix d'achat", before: resolution.previousCost, after: resolution.newCost }],
            metadata: { strategy: resolution.strategy, stockBefore: qtyBefore, incomingCost: line.unitCost, threshold: settings.costThreshold, purchaseId }
          }, ctx.db);
        }

        costReport.push({
          code: line.product.code,
          name: line.product.name,
          qty: line.qty,
          stockBefore: qtyBefore,
          stockAfter: qtyAfter,
          incomingCost: line.unitCost,
          previousCost: resolution.previousCost,
          newCost: resolution.newCost,
          strategy: resolution.strategy,
          reason: resolution.reason
        });
      }

      const debt = total - amountPaid;
      if (debt > 0) {
        ctx.db.prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, purchase_id, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(supplierId, 'achat', debt, purchaseId, `Achat #${purchaseId} reste dû`, ctx.session.userId);
      }

      recordAudit({
        actor: ctx.actor,
        action: 'purchase.created',
        module: 'achat',
        entityType: 'purchase',
        entityId: purchaseId,
        storeId,
        summary: `Bon d'achat #${purchaseId} — ${supplier.name} : ${lines.length} ligne(s), ${(total / 100).toFixed(2)} DA.`,
        metadata: { supplierId, total, amountPaid, debt, paymentType, reference: text(payload?.reference), costReport }
      }, ctx.db);

      enqueueSync(ctx.db, 'purchase', purchaseId, 'create', { purchaseId, storeId, total });

      return { purchaseId, total, amountPaid, debt, costReport };
    })();
  });

  secure('get-purchases', { module: 'achat', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const args: any[] = [];
    let sql = `
      SELECT p.*, s.name as supplierName, s.phone as supplierPhone, u.full_name as userName, st.name as storeName
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.user_id = u.id
      JOIN stores st ON p.store_id = st.id
      WHERE 1=1
    `;
    if (storeId) { sql += ' AND p.store_id = ?'; args.push(storeId); }
    if (params?.dateFrom) { sql += ' AND date(p.created_at) >= date(?)'; args.push(params.dateFrom); }
    if (params?.dateTo) { sql += ' AND date(p.created_at) <= date(?)'; args.push(params.dateTo); }
    sql += ' ORDER BY p.id DESC LIMIT ?';
    args.push(Math.min(int(params?.limit, 300) || 300, 2000));

    const purchases = ctx.db.prepare(sql).all(...args) as any[];
    const itemStmt = ctx.db.prepare(`
      SELECT pi.*, p.name as productName, p.code as productCode
      FROM purchase_items pi JOIN products p ON pi.product_id = p.id WHERE pi.purchase_id = ?
    `);
    return purchases.map(pur => ({ ...pur, items: itemStmt.all(pur.id) }));
  });

  // ───────────────────────────── Clients ─────────────────────────────

  secure('get-clients', { module: 'clients', action: 'view' }, (ctx) => {
    const list = ctx.db.prepare('SELECT * FROM clients ORDER BY is_fidele DESC, name ASC').all() as any[];
    const debtStmt = ctx.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
      FROM client_transactions WHERE client_id = ?
    `);
    return list.map(c => {
      const debt = (debtStmt.get(c.id) as any)?.debt || 0;
      return {
        ...c,
        isFidele: Boolean(c.is_fidele),
        creditLimit: c.credit_limit,
        currentDebt: Math.max(0, debt),
        availableCredit: c.credit_limit > 0 ? Math.max(0, c.credit_limit - debt) : null
      };
    });
  });

  secure('create-client', { module: 'clients', action: 'edit' }, (ctx, payload: any) => {
    const name = text(payload?.name);
    if (!name) throw new Error('Le nom du client est obligatoire.');
    const id = Number(ctx.db.prepare('INSERT INTO clients (name, phone, address, is_fidele, credit_limit) VALUES (?, ?, ?, ?, ?)')
      .run(name, text(payload?.phone), text(payload?.address), payload?.isFidele ? 1 : 0, int(payload?.creditLimit)).lastInsertRowid);

    recordAudit({
      actor: ctx.actor, action: 'client.created', module: 'clients', entityType: 'client', entityId: id,
      summary: `Client créé : ${name}`, storeId: ctx.session.storeId,
      metadata: { phone: text(payload?.phone), creditLimit: int(payload?.creditLimit), isFidele: Boolean(payload?.isFidele) }
    }, ctx.db);
    return { id, name };
  });

  secure('update-client', { module: 'clients', action: 'edit' }, (ctx, payload: any) => {
    const id = positiveInt(payload?.id, 'client');
    const before = ctx.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    if (!before) throw new Error('Client introuvable.');

    ctx.db.prepare('UPDATE clients SET name = ?, phone = ?, address = ?, is_fidele = ?, credit_limit = ? WHERE id = ?')
      .run(text(payload?.name, before.name) || before.name, text(payload?.phone, before.phone),
        text(payload?.address, before.address), payload?.isFidele ? 1 : 0,
        payload?.creditLimit === undefined ? before.credit_limit : int(payload.creditLimit), id);

    const after = ctx.db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    const changes = diffRecords(
      { name: before.name, phone: before.phone, address: before.address, is_fidele: before.is_fidele, credit_limit: before.credit_limit },
      { name: after.name, phone: after.phone, address: after.address, is_fidele: after.is_fidele, credit_limit: after.credit_limit },
      { name: 'Nom', phone: 'Téléphone', address: 'Adresse', is_fidele: 'Client fidèle', credit_limit: 'Plafond de crédit' }
    );
    if (changes.length) {
      recordAudit({
        actor: ctx.actor, action: 'client.updated', module: 'clients', entityType: 'client', entityId: id,
        summary: `Client ${after.name} modifié (${changes.map(c => c.label).join(', ')}).`, changes, storeId: ctx.session.storeId
      }, ctx.db);
    }
    return { success: true, changes: changes.length };
  });

  secure('create-client-versement', { module: 'clients', action: 'edit' }, (ctx, payload: any) => {
    const clientId = positiveInt(payload?.clientId, 'client');
    const amount = positiveInt(payload?.amount, 'montant');
    const client = ctx.db.prepare('SELECT name FROM clients WHERE id = ?').get(clientId) as any;
    if (!client) throw new Error('Client introuvable.');

    const id = Number(ctx.db.prepare('INSERT INTO client_transactions (client_id, type, amount, note, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(clientId, 'versement', amount, text(payload?.note, 'Versement'), ctx.session.userId).lastInsertRowid);

    recordAudit({
      actor: ctx.actor, action: 'client.payment', module: 'clients', entityType: 'client', entityId: clientId,
      summary: `Versement de ${(amount / 100).toFixed(2)} DA reçu de ${client.name}.`,
      storeId: ctx.session.storeId, metadata: { amount, note: text(payload?.note), transactionId: id }
    }, ctx.db);
    return { id, amount };
  });

  secure('get-client-transactions', { module: 'clients', action: 'view' }, (ctx, payload: any) => {
    const clientId = positiveInt(typeof payload === 'number' ? payload : payload?.clientId, 'client');
    return ctx.db.prepare(`
      SELECT t.*, u.full_name as userName FROM client_transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.client_id = ? ORDER BY t.id DESC
    `).all(clientId);
  });

  // ───────────────────────────── Fournisseurs ─────────────────────────────

  secure('get-suppliers', { module: 'fournisseurs', action: 'view' }, (ctx) => {
    const list = ctx.db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all() as any[];
    const debtStmt = ctx.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
      FROM supplier_transactions WHERE supplier_id = ?
    `);
    return list.map(s => ({ ...s, currentDebt: Math.max(0, (debtStmt.get(s.id) as any)?.debt || 0) }));
  });

  secure('create-supplier', { module: 'fournisseurs', action: 'edit' }, (ctx, payload: any) => {
    const name = text(payload?.name);
    if (!name) throw new Error('Le nom du fournisseur est obligatoire.');
    const id = Number(ctx.db.prepare('INSERT INTO suppliers (name, phone, address) VALUES (?, ?, ?)')
      .run(name, text(payload?.phone), text(payload?.address)).lastInsertRowid);
    recordAudit({
      actor: ctx.actor, action: 'supplier.created', module: 'fournisseurs', entityType: 'supplier', entityId: id,
      summary: `Fournisseur créé : ${name}`, storeId: ctx.session.storeId
    }, ctx.db);
    return { id, name };
  });

  secure('create-supplier-versement', { module: 'fournisseurs', action: 'edit' }, (ctx, payload: any) => {
    const supplierId = positiveInt(payload?.supplierId, 'fournisseur');
    const amount = positiveInt(payload?.amount, 'montant');
    const supplier = ctx.db.prepare('SELECT name FROM suppliers WHERE id = ?').get(supplierId) as any;
    if (!supplier) throw new Error('Fournisseur introuvable.');

    const id = Number(ctx.db.prepare('INSERT INTO supplier_transactions (supplier_id, type, amount, note, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(supplierId, 'versement', amount, text(payload?.note, 'Règlement fournisseur'), ctx.session.userId).lastInsertRowid);

    recordAudit({
      actor: ctx.actor, action: 'supplier.payment', module: 'fournisseurs', entityType: 'supplier', entityId: supplierId,
      summary: `Règlement de ${(amount / 100).toFixed(2)} DA versé à ${supplier.name}.`,
      storeId: ctx.session.storeId, metadata: { amount, transactionId: id }
    }, ctx.db);
    return { id, amount };
  });

  secure('get-supplier-transactions', { module: 'fournisseurs', action: 'view' }, (ctx, payload: any) => {
    const supplierId = positiveInt(typeof payload === 'number' ? payload : payload?.supplierId, 'fournisseur');
    return ctx.db.prepare(`
      SELECT t.*, u.full_name as userName FROM supplier_transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.supplier_id = ? ORDER BY t.id DESC
    `).all(supplierId);
  });

  // ───────────────────────────── Dépenses ─────────────────────────────

  secure('get-expense-categories', { module: 'depenses', action: 'view' }, (ctx) =>
    ctx.db.prepare('SELECT * FROM expense_categories ORDER BY id ASC').all());

  secure('add-expense-category', { module: 'depenses', action: 'edit' }, (ctx, name: string) => {
    const value = text(name);
    if (!value) throw new Error('Nom de catégorie vide.');
    try {
      const id = Number(ctx.db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(value).lastInsertRowid);
      recordAudit({
        actor: ctx.actor, action: 'metadata.created', module: 'depenses', entityType: 'expense_category', entityId: id,
        summary: `Catégorie de dépense ajoutée : ${value}`, storeId: ctx.session.storeId
      }, ctx.db);
      return { id, name: value };
    } catch {
      throw new Error('Cette catégorie existe déjà.');
    }
  });

  secure('get-depenses', { module: 'depenses', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const args: any[] = [];
    let sql = `
      SELECT d.*, ec.name as categoryName, u.full_name as userName, st.name as storeName
      FROM depenses d
      JOIN expense_categories ec ON d.category_id = ec.id
      LEFT JOIN users u ON d.user_id = u.id
      JOIN stores st ON d.store_id = st.id
      WHERE 1=1
    `;
    if (storeId) { sql += ' AND d.store_id = ?'; args.push(storeId); }
    if (params?.categoryId) { sql += ' AND d.category_id = ?'; args.push(int(params.categoryId)); }
    if (params?.dateFrom) { sql += ' AND date(d.depense_date) >= date(?)'; args.push(params.dateFrom); }
    if (params?.dateTo) { sql += ' AND date(d.depense_date) <= date(?)'; args.push(params.dateTo); }
    sql += ' ORDER BY d.id DESC';
    return ctx.db.prepare(sql).all(...args);
  });

  secure('create-depense', { module: 'depenses', action: 'edit' }, (ctx, payload: any) => {
    const storeId = ctx.writeStore(payload?.storeId);
    const categoryId = positiveInt(payload?.categoryId, 'catégorie');
    const amount = positiveInt(payload?.amount, 'montant');
    const category = ctx.db.prepare('SELECT name FROM expense_categories WHERE id = ?').get(categoryId) as any;
    if (!category) throw new Error('Catégorie de dépense introuvable.');

    const id = Number(ctx.db.prepare(`
      INSERT INTO depenses (store_id, category_id, amount, note, user_id, depense_date) VALUES (?, ?, ?, ?, ?, ?)
    `).run(storeId, categoryId, amount, text(payload?.note), ctx.session.userId, payload?.depenseDate || new Date().toISOString()).lastInsertRowid);

    recordAudit({
      actor: ctx.actor, action: 'expense.created', module: 'depenses', entityType: 'depense', entityId: id, storeId,
      summary: `Dépense ${category.name} : ${(amount / 100).toFixed(2)} DA. ${text(payload?.note)}`,
      metadata: { amount, categoryId, note: text(payload?.note) }
    }, ctx.db);
    return { id, success: true };
  });

  secure('delete-depense', { module: 'depenses', action: 'edit' }, (ctx, payload: any) => {
    const id = positiveInt(typeof payload === 'number' ? payload : payload?.id, 'dépense');
    const row = ctx.db.prepare('SELECT d.*, ec.name as categoryName FROM depenses d JOIN expense_categories ec ON d.category_id = ec.id WHERE d.id = ?').get(id) as any;
    if (!row) throw new Error('Dépense introuvable.');
    ctx.writeStore(row.store_id);

    ctx.db.prepare('DELETE FROM depenses WHERE id = ?').run(id);
    recordAudit({
      actor: ctx.actor, action: 'expense.deleted', module: 'depenses', entityType: 'depense', entityId: id,
      storeId: row.store_id, severity: 'warning',
      summary: `Dépense supprimée : ${row.categoryName} — ${(row.amount / 100).toFixed(2)} DA du ${String(row.depense_date).slice(0, 10)}.`,
      metadata: { amount: row.amount, categoryName: row.categoryName, note: row.note, originalDate: row.depense_date }
    }, ctx.db);
    return { success: true };
  });

  secure('get-depenses-total', { module: 'depenses', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId);
    const args: any[] = [];
    let sql = 'SELECT COALESCE(SUM(amount), 0) as total FROM depenses WHERE 1=1';
    if (storeId) { sql += ' AND store_id = ?'; args.push(storeId); }
    if (params?.dateFrom) { sql += ' AND date(depense_date) >= date(?)'; args.push(params.dateFrom); }
    if (params?.dateTo) { sql += ' AND date(depense_date) <= date(?)'; args.push(params.dateTo); }
    return (ctx.db.prepare(sql).get(...args) as any)?.total || 0;
  });

  // ───────────────────────────── Rapports ─────────────────────────────

  secure('get-reports', { module: 'rapport', action: 'view' }, (ctx, params: any) => buildReports(ctx, params));
  secure('get-daily-kpi', { module: 'pos', action: 'view' }, (ctx, payload: any) => {
    const storeId = ctx.scopeStore(typeof payload === 'number' ? payload : payload?.storeId) || ctx.session.storeId || 1;
    return dailyKpi(ctx, storeId);
  });

  // ───────────────────────────── Paramètres ─────────────────────────────

  secure('get-settings', { module: 'settings', action: 'view' }, (ctx, payload: any) => {
    const storeId = (typeof payload === 'number' ? payload : payload?.storeId) || ctx.session.storeId || 1;
    return ctx.db.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId);
  });

  secure('save-settings', { module: 'settings', action: 'edit' }, (ctx, payload: any) => {
    const storeId = ctx.writeStore(payload?.storeId);
    const before = ctx.db.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId) as any;

    ctx.db.prepare(`
      INSERT INTO settings (store_id, store_name, address, phone, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition, avg_price_mode, cost_threshold, low_stock_alert, allow_negative_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        store_name = excluded.store_name, address = excluded.address, phone = excluded.phone,
        printer_type = excluded.printer_type, printer_target = excluded.printer_target,
        receipt_footer = excluded.receipt_footer, tax_rate = excluded.tax_rate,
        nif = excluded.nif, nis = excluded.nis, rc = excluded.rc,
        article_imposition = excluded.article_imposition, avg_price_mode = excluded.avg_price_mode,
        cost_threshold = excluded.cost_threshold, low_stock_alert = excluded.low_stock_alert,
        allow_negative_stock = excluded.allow_negative_stock
    `).run(
      storeId, text(payload?.storeName, before?.store_name || ''), text(payload?.address, before?.address || ''),
      text(payload?.phone, before?.phone || ''), text(payload?.printerType, before?.printer_type || 'none'),
      text(payload?.printerTarget, before?.printer_target || ''), text(payload?.receiptFooter, before?.receipt_footer || ''),
      int(payload?.taxRate, before?.tax_rate || 0), text(payload?.nif, before?.nif || ''), text(payload?.nis, before?.nis || ''),
      text(payload?.rc, before?.rc || ''), text(payload?.articleImposition, before?.article_imposition || ''),
      payload?.avgPriceMode === undefined ? (before?.avg_price_mode ?? 1) : (payload.avgPriceMode ? 1 : 0),
      Math.max(0, int(payload?.costThreshold, before?.cost_threshold ?? 5)),
      Math.max(0, int(payload?.lowStockAlert, before?.low_stock_alert ?? 5)),
      payload?.allowNegativeStock ? 1 : 0
    );

    const after = ctx.db.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId) as any;
    const changes = diffRecords(before || {}, after, {
      store_name: 'Nom de la boutique', address: 'Adresse', phone: 'Téléphone',
      printer_type: 'Type d\'imprimante', printer_target: 'Imprimante', receipt_footer: 'Pied de ticket',
      tax_rate: 'Taux de taxe', cost_threshold: 'Seuil prix dominant', low_stock_alert: 'Alerte stock bas',
      allow_negative_stock: 'Stock négatif autorisé', avg_price_mode: 'Mode prix moyen'
    }).filter(c => c.field !== 'id');

    if (changes.length) {
      recordAudit({
        actor: ctx.actor, action: 'settings.updated', module: 'settings', entityType: 'settings', entityId: storeId,
        storeId, severity: 'critical',
        summary: `Paramètres de la boutique #${storeId} modifiés (${changes.map(c => c.label).join(', ')}).`,
        changes
      }, ctx.db);
    }
    return { success: true, changes: changes.length };
  });

  secure('get-printers', { module: 'settings', action: 'view' }, async (_ctx, _payload, event) => {
    try {
      const list = await event.sender.getPrintersAsync();
      if (list?.length) {
        return list.map(p => ({
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: p.isDefault,
          type: /pos|thermal|tm-|xprinter/i.test(p.name) ? 'thermal' : 'system'
        }));
      }
    } catch {}
    return [
      { name: 'POS-80 Thermal Printer (USB)', displayName: 'POS-80 Thermal Printer (USB)', isDefault: true, type: 'thermal' },
      { name: 'EPSON TM-T20III Receipt (USB)', displayName: 'EPSON TM-T20III Receipt (USB)', isDefault: false, type: 'thermal' },
      { name: 'Xprinter XP-N160I (LAN)', displayName: 'Xprinter XP-N160I (LAN)', isDefault: false, type: 'thermal' },
      { name: 'Microsoft Print to PDF', displayName: 'Microsoft Print to PDF', isDefault: false, type: 'virtual' }
    ];
  });

  secure('get-shortcuts', null, (ctx) => {
    const rows = ctx.db.prepare('SELECT action, shortcut FROM keyboard_shortcuts').all() as any[];
    return Object.fromEntries(rows.map(r => [r.action, r.shortcut]));
  });

  secure('save-shortcuts', { module: 'settings', action: 'edit' }, (ctx, shortcuts: Record<string, string>) => {
    const upsert = ctx.db.prepare('INSERT INTO keyboard_shortcuts (action, shortcut) VALUES (?, ?) ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut');
    ctx.db.transaction(() => {
      for (const [action, shortcut] of Object.entries(shortcuts || {})) upsert.run(action, String(shortcut));
    })();
    recordAudit({
      actor: ctx.actor, action: 'settings.updated', module: 'settings', entityType: 'shortcuts', entityId: null,
      summary: 'Raccourcis clavier modifiés.', storeId: ctx.session.storeId, severity: 'notice'
    }, ctx.db);
    return { success: true };
  });

  // ───────────────────────────── Référentiels ─────────────────────────────

  registerMetadataCrud(secureMetadata);

  function secureMetadata(channel: string, action: Action, handler: (ctx: Ctx, payload: any) => any) {
    secure(channel, { module: 'produits', action }, handler);
  }

  secure('get-locations', { module: 'produits', action: 'view' }, (ctx) =>
    (ctx.db.prepare("SELECT DISTINCT location FROM products WHERE location != '' ORDER BY location ASC").all() as any[]).map(r => r.location));

  secure('get-saved-locations', { module: 'produits', action: 'view' }, (ctx) =>
    (ctx.db.prepare('SELECT location FROM saved_locations ORDER BY location ASC').all() as any[]).map(r => r.location));

  secure('add-saved-location', { module: 'produits', action: 'edit' }, (ctx, location: string) => {
    const value = text(location).toUpperCase();
    if (!value) throw new Error('Emplacement vide.');
    ctx.db.prepare('INSERT OR IGNORE INTO saved_locations (location) VALUES (?)').run(value);
    return { success: true };
  });

  // ───────────────────────────── Utilisateurs & rôles ─────────────────────────────

  secure('get-users', { module: 'users', action: 'view' }, (ctx) => {
    const users = ctx.db.prepare(`
      SELECT u.id, u.store_id, u.full_name, u.username, u.role, u.is_active, u.phone,
             u.last_login_at, u.failed_attempts, u.locked_until, u.must_change_password, u.created_at,
             s.name as storeName
      FROM users u LEFT JOIN stores s ON u.store_id = s.id
      ORDER BY u.id ASC
    `).all() as any[];
    const permStmt = ctx.db.prepare('SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?');
    const statsStmt = ctx.db.prepare(`
      SELECT (SELECT COUNT(*) FROM sales WHERE user_id = ?) as salesCount,
             (SELECT COUNT(*) FROM audit_log WHERE user_id = ?) as auditCount
    `);

    return users.map(u => ({
      id: u.id,
      storeId: u.store_id,
      storeName: u.storeName,
      fullName: u.full_name,
      username: u.username,
      role: u.role,
      phone: u.phone || '',
      isActive: Boolean(u.is_active),
      lastLoginAt: u.last_login_at,
      failedAttempts: u.failed_attempts || 0,
      isLocked: Boolean(u.locked_until && new Date(u.locked_until).getTime() > Date.now()),
      lockedUntil: u.locked_until,
      mustChangePassword: Boolean(u.must_change_password),
      createdAt: u.created_at,
      permissions: (permStmt.all(u.id) as any[]).map(p => ({ module: p.module, canView: Boolean(p.can_view), canEdit: Boolean(p.can_edit) })),
      stats: statsStmt.get(u.id, u.id)
    }));
  });

  secure('get-role-template', { module: 'users', action: 'view' }, (_ctx, payload: any) => {
    const role = (USER_ROLES as readonly string[]).includes(payload?.role) ? (payload.role as UserRole) : 'cashier';
    return { role, permissions: defaultPermissionsFor(role), modules: SYSTEM_MODULES.map(m => ({ id: m, label: MODULE_LABELS[m] })) };
  });

  secure('create-user', { module: 'users', action: 'edit' }, (ctx, payload: any) => {
    requireOwner(ctx.session);
    const fullName = text(payload?.fullName);
    const username = text(payload?.username).toLowerCase();
    const role = (USER_ROLES as readonly string[]).includes(payload?.role) ? (payload.role as UserRole) : 'cashier';
    if (!fullName) throw new Error('Le nom complet est obligatoire.');
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Identifiant invalide (3 à 32 caractères : lettres, chiffres, . _ -).');
    validatePasswordStrength(payload?.password);
    if (ctx.db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username)) {
      throw new Error('Cet identifiant est déjà utilisé.');
    }

    return ctx.db.transaction(() => {
      const userId = Number(ctx.db.prepare(`
        INSERT INTO users (store_id, full_name, username, password_hash, is_active, role, phone, must_change_password)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        payload?.storeId ? positiveInt(payload.storeId, 'boutique') : null,
        fullName, username, bcrypt.hashSync(String(payload.password), 10), role,
        text(payload?.phone), payload?.mustChangePassword ? 1 : 0
      ).lastInsertRowid);

      const rows = Array.isArray(payload?.permissions) && payload.permissions.length
        ? payload.permissions
        : defaultPermissionsFor(role);
      applyPermissions(ctx, userId, rows);

      recordAudit({
        actor: ctx.actor, action: 'user.created', module: 'users', entityType: 'user', entityId: userId,
        severity: 'critical', storeId: ctx.session.storeId,
        summary: `Compte créé : ${fullName} (@${username}) — rôle ${role}.`,
        metadata: { role, storeId: payload?.storeId || null, permissions: rows }
      }, ctx.db);

      return { id: userId, username, role };
    })();
  });

  secure('update-user', { module: 'users', action: 'edit' }, (ctx, payload: any) => {
    requireOwner(ctx.session);
    const id = positiveInt(payload?.id, 'utilisateur');
    const before = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!before) throw new Error('Utilisateur introuvable.');

    const role = (USER_ROLES as readonly string[]).includes(payload?.role) ? (payload.role as UserRole) : (before.role as UserRole);
    const isActive = payload?.isActive === undefined ? before.is_active : (payload.isActive ? 1 : 0);

    if (before.role === 'owner' && (role !== 'owner' || !isActive)) {
      const owners = (ctx.db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'owner' AND is_active = 1 AND id != ?").get(id) as any)?.cnt || 0;
      if (owners === 0) throw new Error('Impossible : il doit rester au moins un propriétaire actif.');
    }

    ctx.db.prepare(`
      UPDATE users SET full_name = ?, role = ?, store_id = ?, phone = ?, is_active = ?,
             must_change_password = ?, locked_until = CASE WHEN ? = 1 THEN NULL ELSE locked_until END,
             failed_attempts = CASE WHEN ? = 1 THEN 0 ELSE failed_attempts END
      WHERE id = ?
    `).run(
      text(payload?.fullName, before.full_name) || before.full_name, role,
      payload?.storeId === undefined ? before.store_id : (payload.storeId ? positiveInt(payload.storeId, 'boutique') : null),
      text(payload?.phone, before.phone || ''), isActive,
      payload?.mustChangePassword === undefined ? before.must_change_password : (payload.mustChangePassword ? 1 : 0),
      payload?.unlock ? 1 : 0, payload?.unlock ? 1 : 0, id
    );

    if (Array.isArray(payload?.permissions)) applyPermissions(ctx, id, payload.permissions);
    else if (role !== before.role) applyPermissions(ctx, id, defaultPermissionsFor(role));

    const after = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    const changes = diffRecords(
      { full_name: before.full_name, role: before.role, store_id: before.store_id, is_active: before.is_active, phone: before.phone },
      { full_name: after.full_name, role: after.role, store_id: after.store_id, is_active: after.is_active, phone: after.phone },
      { full_name: 'Nom complet', role: 'Rôle', store_id: 'Boutique', is_active: 'Compte actif', phone: 'Téléphone' }
    );

    refreshSessionPermissions(id);

    recordAudit({
      actor: ctx.actor,
      action: after.is_active ? 'user.updated' : 'user.deactivated',
      module: 'users', entityType: 'user', entityId: id, severity: 'critical', storeId: ctx.session.storeId,
      summary: after.is_active
        ? `Compte @${after.username} modifié (${changes.map(c => c.label).join(', ') || 'permissions'}).`
        : `Compte @${after.username} désactivé.`,
      changes,
      metadata: { permissionsUpdated: Array.isArray(payload?.permissions), unlocked: Boolean(payload?.unlock) }
    }, ctx.db);

    return { success: true };
  });

  secure('reset-user-password', { module: 'users', action: 'edit' }, (ctx, payload: any) => {
    requireOwner(ctx.session);
    const id = positiveInt(payload?.id, 'utilisateur');
    const user = ctx.db.prepare('SELECT username, full_name FROM users WHERE id = ?').get(id) as any;
    if (!user) throw new Error('Utilisateur introuvable.');
    validatePasswordStrength(payload?.newPassword);

    ctx.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(bcrypt.hashSync(String(payload.newPassword), 10), id);

    recordAudit({
      actor: ctx.actor, action: 'auth.password.changed', module: 'users', entityType: 'user', entityId: id,
      severity: 'critical', storeId: ctx.session.storeId,
      summary: `Mot de passe de @${user.username} réinitialisé par ${ctx.session.fullName}. Changement imposé à la prochaine connexion.`
    }, ctx.db);
    return { success: true };
  });

  secure('set-user-permissions', { module: 'users', action: 'edit' }, (ctx, payload: any) => {
    requireOwner(ctx.session);
    const id = positiveInt(payload?.userId, 'utilisateur');
    const user = ctx.db.prepare('SELECT username, role FROM users WHERE id = ?').get(id) as any;
    if (!user) throw new Error('Utilisateur introuvable.');
    if (user.role === 'owner') throw new Error('Le propriétaire conserve toujours tous les droits.');

    const beforeRows = ctx.db.prepare('SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?').all(id) as any[];
    applyPermissions(ctx, id, payload?.permissions || []);
    const afterRows = ctx.db.prepare('SELECT module, can_view, can_edit FROM permissions WHERE user_id = ?').all(id) as any[];

    const flat = (rows: any[]) => Object.fromEntries(rows.map(r => [r.module, `${r.can_view ? 'V' : '-'}${r.can_edit ? 'E' : '-'}`]));
    const changes = diffRecords(flat(beforeRows), flat(afterRows), Object.fromEntries(SYSTEM_MODULES.map(m => [m, MODULE_LABELS[m]])));

    refreshSessionPermissions(id);

    if (changes.length) {
      recordAudit({
        actor: ctx.actor, action: 'user.permissions.changed', module: 'users', entityType: 'user', entityId: id,
        severity: 'critical', storeId: ctx.session.storeId,
        summary: `Permissions de @${user.username} modifiées sur ${changes.length} module(s).`,
        changes
      }, ctx.db);
    }
    return { success: true, changes: changes.length };
  });

  secure('get-login-attempts', { module: 'journal', action: 'view' }, (ctx, params: any) =>
    ctx.db.prepare('SELECT * FROM login_attempts ORDER BY id DESC LIMIT ?').all(Math.min(int(params?.limit, 100) || 100, 500)));

  // ───────────────────────────── Journal d'audit ─────────────────────────────

  secure('get-audit-log', { module: 'journal', action: 'view' }, (ctx, params: any) => {
    const scoped = { ...(params || {}) };
    const storeId = ctx.scopeStore(params?.storeId);
    if (storeId) scoped.storeId = storeId;
    return queryAudit(scoped);
  });

  secure('get-audit-stats', { module: 'journal', action: 'view' }, (ctx, params: any) =>
    auditStats(ctx.scopeStore(params?.storeId) || undefined));

  secure('get-audit-filters', { module: 'journal', action: 'view' }, (ctx) => ({
    modules: (ctx.db.prepare('SELECT DISTINCT module FROM audit_log ORDER BY module').all() as any[]).map(r => r.module),
    actions: (ctx.db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all() as any[]).map(r => r.action),
    users: ctx.db.prepare('SELECT DISTINCT user_id as id, user_name as name FROM audit_log WHERE user_id IS NOT NULL ORDER BY user_name').all()
  }));

  // ───────────────────────────── Synchronisation cloud ─────────────────────────────

  secure('get-sync-payload', { module: 'settings', action: 'view' }, (ctx, params: any) => {
    const storeId = ctx.scopeStore(params?.storeId) || ctx.session.storeId || 1;
    const limit = Math.min(int(params?.limit, 500) || 500, 2000);

    const auditEntries = ctx.db.prepare(
      'SELECT * FROM audit_log WHERE synced_at IS NULL AND (store_id = ? OR store_id IS NULL) ORDER BY id ASC LIMIT ?'
    ).all(storeId, limit) as any[];

    return {
      storeId,
      deviceId: getDeviceId(),
      generatedAt: new Date().toISOString(),
      auditEntries,
      auditCursor: auditEntries.length ? auditEntries[auditEntries.length - 1].id : null,
      sales: ctx.db.prepare('SELECT * FROM sales WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limit),
      saleItems: ctx.db.prepare('SELECT si.* FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.store_id = ? ORDER BY si.id DESC LIMIT ?').all(storeId, limit * 3),
      purchases: ctx.db.prepare('SELECT * FROM purchases WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limit),
      purchaseItems: ctx.db.prepare('SELECT pi.* FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE p.store_id = ? ORDER BY pi.id DESC LIMIT ?').all(storeId, limit * 3),
      returns: ctx.db.prepare('SELECT * FROM returns WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limit),
      stockMovements: ctx.db.prepare('SELECT * FROM stock_movements WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limit),
      costHistory: ctx.db.prepare('SELECT * FROM product_cost_history ORDER BY id DESC LIMIT ?').all(limit),
      depenses: ctx.db.prepare('SELECT * FROM depenses WHERE store_id = ? ORDER BY id DESC LIMIT ?').all(storeId, limit),
      stock: ctx.db.prepare('SELECT ps.*, p.code, p.name, p.price_achat FROM product_stock ps JOIN products p ON ps.product_id = p.id WHERE ps.store_id = ?').all(storeId),
      clientTransactions: ctx.db.prepare('SELECT * FROM client_transactions ORDER BY id DESC LIMIT ?').all(limit),
      supplierTransactions: ctx.db.prepare('SELECT * FROM supplier_transactions ORDER BY id DESC LIMIT ?').all(limit)
    };
  });

  secure('mark-sync-result', { module: 'settings', action: 'view' }, (ctx, payload: any) => {
    const ok = Boolean(payload?.success);
    if (ok && payload?.auditCursor) {
      ctx.db.prepare('UPDATE audit_log SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL AND id <= ?').run(int(payload.auditCursor));
    }
    recordAudit({
      actor: ctx.actor,
      action: ok ? 'sync.pushed' : 'sync.failed',
      module: 'settings',
      storeId: ctx.session.storeId,
      summary: ok
        ? `Synchronisation cloud réussie (${int(payload?.pushedCount)} enregistrement(s)).`
        : `Échec de synchronisation cloud : ${text(payload?.error, 'erreur inconnue')}`,
      metadata: { pushedCount: int(payload?.pushedCount), error: text(payload?.error), serverUrl: text(payload?.serverUrl) }
    }, ctx.db);
    return { success: true };
  });

  console.log(`[ipc] ${ipcMain.eventNames().length} canaux sécurisés enregistrés.`);
}

// ───────────────────────────── Helpers ─────────────────────────────

function requireOwner(session: Session) {
  if (session.role !== 'owner') {
    throw new PermissionError('Seul le propriétaire peut gérer les comptes utilisateurs.');
  }
}

function applyPermissions(ctx: Ctx, userId: number, rows: any[]) {
  const known = new Set<string>(SYSTEM_MODULES);
  const upsert = ctx.db.prepare(`
    INSERT INTO permissions (user_id, module, can_view, can_edit) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, module) DO UPDATE SET can_view = excluded.can_view, can_edit = excluded.can_edit
  `);
  ctx.db.transaction(() => {
    for (const r of rows) {
      if (!known.has(r?.module)) continue;
      // Un droit de modification sans droit de consultation n'a pas de sens.
      const canView = Boolean(r.canView) || Boolean(r.canEdit);
      upsert.run(userId, r.module, canView ? 1 : 0, r.canEdit ? 1 : 0);
    }
  })();
}

function applyProductColors(db: ReturnType<typeof getLocalDb>, productId: number, payload: any) {
  if (payload?.colorIds === undefined && payload?.mergeColorIds === undefined) return;
  db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(productId);
  const insert = db.prepare('INSERT INTO product_colors (product_id, color_id, merge_group_id) VALUES (?, ?, ?)');
  const mode = payload?.colorMode || 'single';

  if (mode === 'single' && payload?.colorIds?.length) {
    insert.run(productId, payload.colorIds[0], null);
  } else if (mode === 'variants' && payload?.colorIds?.length) {
    for (const cid of payload.colorIds) insert.run(productId, cid, null);
  } else if (mode === 'merged' && payload?.mergeColorIds?.length) {
    const groupId = `merge-${productId}-${Date.now()}`;
    for (const cid of payload.mergeColorIds) insert.run(productId, cid, groupId);
  }
}

function applyProductCompat(db: ReturnType<typeof getLocalDb>, productId: number, modelIds: any) {
  db.prepare('DELETE FROM product_motorcycle_compat WHERE product_id = ?').run(productId);
  if (!Array.isArray(modelIds) || !modelIds.length) return;
  const insert = db.prepare('INSERT OR IGNORE INTO product_motorcycle_compat (product_id, motorcycle_model_id) VALUES (?, ?)');
  for (const mid of modelIds) insert.run(productId, mid);
}

function enqueueSync(db: ReturnType<typeof getLocalDb>, entityType: string, entityId: number, action: string, payload: any) {
  try {
    db.prepare('INSERT INTO sync_queue (entity_type, entity_id, action, payload_json) VALUES (?, ?, ?, ?)')
      .run(entityType, entityId, action, JSON.stringify(payload));
  } catch {}
}

/** Enregistre les CRUD des référentiels (catégories, marques, couleurs, modèles). */
function registerMetadataCrud(reg: (channel: string, action: Action, handler: (ctx: Ctx, payload: any) => any) => void) {
  const entities: Array<{ add: string; del: string; table: string; label: string; extra?: boolean }> = [
    { add: 'add-category', del: 'delete-category', table: 'categories', label: 'Catégorie' },
    { add: 'add-brand', del: 'delete-brand', table: 'brands', label: 'Marque' },
    { add: 'add-motorcycle-model', del: 'delete-motorcycle-model', table: 'motorcycle_models', label: 'Modèle moto' },
    { add: 'add-color', del: 'delete-color', table: 'colors', label: 'Couleur', extra: true }
  ];

  for (const e of entities) {
    reg(e.add, 'edit', (ctx, payload) => {
      const name = typeof payload === 'string' ? payload.trim() : String(payload?.name || '').trim();
      if (!name) throw new Error(`${e.label} : le nom est obligatoire.`);
      try {
        const id = e.extra
          ? Number(ctx.db.prepare('INSERT INTO colors (name, hex_code) VALUES (?, ?)').run(name, payload?.hexCode || '#888888').lastInsertRowid)
          : Number(ctx.db.prepare(`INSERT INTO ${e.table} (name) VALUES (?)`).run(name).lastInsertRowid);
        recordAudit({
          actor: ctx.actor, action: 'metadata.created', module: 'produits', entityType: e.table, entityId: id,
          summary: `${e.label} ajoutée : ${name}`, storeId: ctx.session.storeId
        }, ctx.db);
        return { id, name, hexCode: payload?.hexCode };
      } catch (err: any) {
        if (String(err.message).includes('UNIQUE')) throw new Error(`${e.label} déjà existante : ${name}`);
        throw err;
      }
    });

    reg(e.del, 'edit', (ctx, payload) => {
      const id = positiveInt(typeof payload === 'number' ? payload : payload?.id, e.label);
      const row = ctx.db.prepare(`SELECT name FROM ${e.table} WHERE id = ?`).get(id) as any;
      if (!row) throw new Error(`${e.label} introuvable.`);

      const usage = countMetadataUsage(ctx.db, e.table, id);
      if (usage > 0) {
        throw new Error(`Suppression impossible : ${usage} article(s) utilisent encore « ${row.name} ».`);
      }

      ctx.db.prepare(`DELETE FROM ${e.table} WHERE id = ?`).run(id);
      recordAudit({
        actor: ctx.actor, action: 'metadata.deleted', module: 'produits', entityType: e.table, entityId: id,
        severity: 'warning', summary: `${e.label} supprimée : ${row.name}`, storeId: ctx.session.storeId
      }, ctx.db);
      return { success: true };
    });
  }
}

function countMetadataUsage(db: ReturnType<typeof getLocalDb>, table: string, id: number): number {
  const q = (sql: string) => ((db.prepare(sql).get(id) as any)?.cnt as number) || 0;
  switch (table) {
    case 'categories': return q('SELECT COUNT(*) as cnt FROM products WHERE category_id = ?');
    case 'brands': return q('SELECT COUNT(*) as cnt FROM products WHERE brand_id = ?');
    case 'colors': return q('SELECT COUNT(*) as cnt FROM product_colors WHERE color_id = ?');
    case 'motorcycle_models': return q('SELECT COUNT(*) as cnt FROM product_motorcycle_compat WHERE motorcycle_model_id = ?');
    default: return 0;
  }
}

// ───────────────────────────── Rapports ─────────────────────────────

function periodClause(period: string, column: string): string {
  switch (period) {
    case 'day': return `date(${column}) = date('now')`;
    case 'yesterday': return `date(${column}) = date('now', '-1 day')`;
    case 'week': return `${column} >= datetime('now', '-7 days')`;
    case 'year': return `${column} >= datetime('now', '-365 days')`;
    case 'all': return '1=1';
    case 'month':
    default: return `${column} >= datetime('now', '-30 days')`;
  }
}

function rangeClause(column: string, dateFrom?: string, dateTo?: string): { sql: string; args: any[] } | null {
  if (!dateFrom && !dateTo) return null;
  const parts: string[] = [];
  const args: any[] = [];
  if (dateFrom) { parts.push(`date(${column}) >= date(?)`); args.push(dateFrom); }
  if (dateTo) { parts.push(`date(${column}) <= date(?)`); args.push(dateTo); }
  return { sql: parts.join(' AND '), args };
}

function buildReports(ctx: Ctx, params: any) {
  const period = params?.period || 'month';
  const storeId = ctx.scopeStore(params?.storeId);
  const { dateFrom, dateTo } = params || {};

  const filterFor = (column: string) => {
    const range = rangeClause(column, dateFrom, dateTo);
    return range ? { sql: range.sql, args: range.args } : { sql: periodClause(period, column), args: [] as any[] };
  };

  const storeSql = (alias: string) => (storeId ? ` AND ${alias}.store_id = ?` : '');
  const storeArg = storeId ? [storeId] : [];

  // Chiffre d'affaires : ventes non annulées.
  const salesFilter = filterFor('s.created_at');
  const caRow = ctx.db.prepare(`
    SELECT COALESCE(SUM(s.total), 0) as ca, COUNT(s.id) as cnt,
           COALESCE(SUM(s.amount_credit), 0) as credit
    FROM sales s WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
  `).get(...salesFilter.args, ...storeArg) as any;

  const marginRow = ctx.db.prepare(`
    SELECT COALESCE(SUM((si.unit_price - si.unit_cost_snapshot) * si.qty), 0) as margin,
           COALESCE(SUM(si.unit_cost_snapshot * si.qty), 0) as cogs
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
  `).get(...salesFilter.args, ...storeArg) as any;

  const returnsFilter = filterFor('r.created_at');
  const returnsRow = ctx.db.prepare(`
    SELECT COALESCE(SUM(r.total_refund), 0) as refunds, COUNT(r.id) as cnt
    FROM returns r WHERE ${returnsFilter.sql}${storeSql('r')}
  `).get(...returnsFilter.args, ...storeArg) as any;

  const returnMarginRow = ctx.db.prepare(`
    SELECT COALESCE(SUM((ri.unit_price - ri.unit_cost_snapshot) * ri.qty_returned), 0) as margin
    FROM return_items ri JOIN returns r ON ri.return_id = r.id
    WHERE ${returnsFilter.sql}${storeSql('r')}
  `).get(...returnsFilter.args, ...storeArg) as any;

  const depFilter = filterFor('d.depense_date');
  const depRow = ctx.db.prepare(`
    SELECT COALESCE(SUM(d.amount), 0) as total FROM depenses d WHERE ${depFilter.sql}${storeSql('d')}
  `).get(...depFilter.args, ...storeArg) as any;

  const purFilter = filterFor('p.created_at');
  const purRow = ctx.db.prepare(`
    SELECT COALESCE(SUM(p.total), 0) as total, COUNT(p.id) as cnt FROM purchases p WHERE ${purFilter.sql}${storeSql('p')}
  `).get(...purFilter.args, ...storeArg) as any;

  const grossSales = caRow?.ca || 0;
  const refunds = returnsRow?.refunds || 0;
  const netCA = grossSales - refunds;
  const grossMargin = marginRow?.margin || 0;
  const reversedMargin = returnMarginRow?.margin || 0;
  // Bénéfice brut = marge réalisée − marge annulée par les retours. Jamais borné à zéro :
  // une perte doit rester visible.
  const beneficeBrut = grossMargin - reversedMargin;
  const totalDepenses = depRow?.total || 0;
  const beneficeNet = beneficeBrut - totalDepenses;

  const clientsDebt = ctx.db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
    FROM client_transactions
  `).get() as any;

  const suppliersDebt = ctx.db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as debt
    FROM supplier_transactions
  `).get() as any;

  const stockValue = ctx.db.prepare(`
    SELECT COALESCE(SUM(ps.quantity * p.price_achat), 0) as value, COALESCE(SUM(ps.quantity), 0) as units
    FROM product_stock ps JOIN products p ON ps.product_id = p.id
    WHERE p.is_archived = 0 ${storeId ? 'AND ps.store_id = ?' : ''}
  `).get(...storeArg) as any;

  const topProducts = ctx.db.prepare(`
    SELECT p.code, p.name as productName, SUM(si.qty) as qtySold, SUM(si.line_total) as revenue,
           SUM((si.unit_price - si.unit_cost_snapshot) * si.qty) as margin
    FROM sale_items si JOIN products p ON si.product_id = p.id JOIN sales s ON si.sale_id = s.id
    WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
    GROUP BY si.product_id ORDER BY revenue DESC LIMIT 10
  `).all(...salesFilter.args, ...storeArg);

  const byUser = ctx.db.prepare(`
    SELECT u.full_name as userName, COUNT(s.id) as salesCount, COALESCE(SUM(s.total), 0) as ca
    FROM sales s JOIN users u ON s.user_id = u.id
    WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
    GROUP BY s.user_id ORDER BY ca DESC
  `).all(...salesFilter.args, ...storeArg);

  const byPayment = ctx.db.prepare(`
    SELECT s.payment_type as paymentType, COUNT(s.id) as cnt, COALESCE(SUM(s.total), 0) as total
    FROM sales s WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
    GROUP BY s.payment_type
  `).all(...salesFilter.args, ...storeArg);

  const expenseByCategory = ctx.db.prepare(`
    SELECT ec.name as categoryName, COALESCE(SUM(d.amount), 0) as total, COUNT(d.id) as cnt
    FROM depenses d JOIN expense_categories ec ON d.category_id = ec.id
    WHERE ${depFilter.sql}${storeSql('d')}
    GROUP BY d.category_id ORDER BY total DESC
  `).all(...depFilter.args, ...storeArg);

  const chartRows = ctx.db.prepare(`
    SELECT date(s.created_at) as date,
           COALESCE(SUM(s.total), 0) as ca,
           COUNT(s.id) as ventesCount,
           COALESCE(SUM((SELECT SUM((si.unit_price - si.unit_cost_snapshot) * si.qty) FROM sale_items si WHERE si.sale_id = s.id)), 0) as benefice
    FROM sales s WHERE ${salesFilter.sql} AND s.status != 'voided'${storeSql('s')}
    GROUP BY date(s.created_at) ORDER BY date ASC
  `).all(...salesFilter.args, ...storeArg) as any[];

  const refundsByDay = ctx.db.prepare(`
    SELECT date(r.created_at) as date, COALESCE(SUM(r.total_refund), 0) as refunds
    FROM returns r WHERE ${returnsFilter.sql}${storeSql('r')} GROUP BY date(r.created_at)
  `).all(...returnsFilter.args, ...storeArg) as any[];
  const refundMap = new Map(refundsByDay.map(r => [r.date, r.refunds]));

  const chartData = chartRows.map(row => ({
    date: row.date,
    ca: row.ca - (refundMap.get(row.date) || 0),
    benefice: row.benefice,
    ventesCount: row.ventesCount
  }));

  return {
    period,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    storeId,
    totalCA: netCA,
    grossSales,
    totalReturns: refunds,
    returnsCount: returnsRow?.cnt || 0,
    cogs: marginRow?.cogs || 0,
    totalBeneficesBrut: beneficeBrut,
    totalDepenses,
    totalBenefices: beneficeNet,
    marginRate: netCA > 0 ? Math.round((beneficeBrut / netCA) * 10000) / 100 : 0,
    salesCount: caRow?.cnt || 0,
    creditIssued: caRow?.credit || 0,
    purchasesTotal: purRow?.total || 0,
    purchasesCount: purRow?.cnt || 0,
    totalDetteClients: Math.max(0, clientsDebt?.debt || 0),
    totalDetteFournisseurs: Math.max(0, suppliersDebt?.debt || 0),
    stockValue: stockValue?.value || 0,
    stockUnits: stockValue?.units || 0,
    topProducts,
    byUser,
    byPayment,
    expenseByCategory,
    chartData: chartData.length ? chartData : [{ date: new Date().toISOString().slice(0, 10), ca: netCA, benefice: beneficeNet, ventesCount: caRow?.cnt || 0 }]
  };
}

function dailyKpi(ctx: Ctx, storeId: number) {
  const showCost = canSeeCost(ctx.session);

  const caRow = ctx.db.prepare(
    "SELECT COALESCE(SUM(total), 0) as ca, COUNT(id) as cnt FROM sales WHERE date(created_at) = date('now') AND store_id = ? AND status != 'voided'"
  ).get(storeId) as any;
  const returnsRow = ctx.db.prepare(
    "SELECT COALESCE(SUM(total_refund), 0) as ret FROM returns WHERE date(created_at) = date('now') AND store_id = ?"
  ).get(storeId) as any;
  const depRow = ctx.db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as dep FROM depenses WHERE date(depense_date) = date('now') AND store_id = ?"
  ).get(storeId) as any;
  const detteRow = ctx.db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN type='achat' THEN amount WHEN type='versement' THEN -amount ELSE 0 END), 0) as dette FROM client_transactions"
  ).get() as any;

  const marginRow = ctx.db.prepare(`
    SELECT COALESCE(SUM((si.unit_price - si.unit_cost_snapshot) * si.qty), 0) as margin
    FROM sale_items si JOIN sales s ON si.sale_id = s.id
    WHERE date(s.created_at) = date('now') AND s.store_id = ? AND s.status != 'voided'
  `).get(storeId) as any;

  const returnMarginRow = ctx.db.prepare(`
    SELECT COALESCE(SUM((ri.unit_price - ri.unit_cost_snapshot) * ri.qty_returned), 0) as margin
    FROM return_items ri JOIN returns r ON ri.return_id = r.id
    WHERE date(r.created_at) = date('now') AND r.store_id = ?
  `).get(storeId) as any;

  const ca = (caRow?.ca || 0) - (returnsRow?.ret || 0);
  const dep = depRow?.dep || 0;
  const beneficeBrut = (marginRow?.margin || 0) - (returnMarginRow?.margin || 0);

  return {
    ca,
    dep,
    salesCount: caRow?.cnt || 0,
    returns: returnsRow?.ret || 0,
    beneficeBrut: showCost ? beneficeBrut : null,
    beneficeNet: showCost ? beneficeBrut - dep : null,
    dette: Math.max(0, detteRow?.dette || 0)
  };
}
