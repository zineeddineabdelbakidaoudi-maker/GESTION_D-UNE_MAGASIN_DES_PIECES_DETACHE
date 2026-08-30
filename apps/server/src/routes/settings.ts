import { Router, Response } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';
import { updateSettingsSchema } from '@gestion-veloo/shared';

const router = Router();

// GET /api/settings/:storeId
router.get('/:storeId', authenticateToken, requirePermission('settings', 'view'), (req: AuthRequest, res: Response) => {
  const storeId = parseInt(req.params.storeId, 10);
  const { rawDb, isPg } = getDb();
  if (isPg) return res.json({});

  const settings = rawDb.prepare('SELECT * FROM settings WHERE store_id = ?').get(storeId);
  res.json(settings || {});
});

// PUT /api/settings/:storeId (Update Fiscal fields: NIF, NIS, RC, AI, Printer)
router.put('/:storeId', authenticateToken, requirePermission('settings', 'edit'), (req: AuthRequest, res: Response) => {
  const storeId = parseInt(req.params.storeId, 10);
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.errors });
  }

  const { rawDb } = getDb();
  const d = parsed.data;

  try {
    const upsert = rawDb.prepare(`
      INSERT INTO settings (store_id, store_name, address, phone, logo_url, printer_type, printer_target, receipt_footer, tax_rate, nif, nis, rc, article_imposition, avg_price_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        store_name = excluded.store_name,
        address = excluded.address,
        phone = excluded.phone,
        logo_url = excluded.logo_url,
        printer_type = excluded.printer_type,
        printer_target = excluded.printer_target,
        receipt_footer = excluded.receipt_footer,
        tax_rate = excluded.tax_rate,
        nif = excluded.nif,
        nis = excluded.nis,
        rc = excluded.rc,
        article_imposition = excluded.article_imposition,
        avg_price_mode = excluded.avg_price_mode
    `);

    upsert.run(
      storeId,
      d.storeName,
      d.address,
      d.phone,
      d.logoUrl || null,
      d.printerType,
      d.printerTarget,
      d.receiptFooter,
      d.taxRate || 0,
      d.nif || null,
      d.nis || null,
      d.rc || null,
      d.articleImposition || null,
      d.avgPriceMode !== undefined ? (d.avgPriceMode ? 1 : 0) : 1
    );

    res.json({ storeId, ...d });
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour des paramètres', details: err.message });
  }
});

export default router;
