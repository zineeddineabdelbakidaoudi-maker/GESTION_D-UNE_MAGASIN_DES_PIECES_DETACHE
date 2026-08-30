import { Router } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// Calculate live Zakat figures & retrieve parameters
router.get('/calculate', authenticateToken, requirePermission('zakat', 'view'), (req, res) => {
  try {
    const { rawDb, isPg } = getDb();
    if (!isPg) {
      // 1. Capital Stock
      const capitalRow = rawDb.prepare(`
        SELECT COALESCE(SUM(p.price_achat * ps.quantity), 0) as capital
        FROM products p
        JOIN product_stock ps ON p.id = ps.product_id
      `).get() as any;
      const capital = capitalRow?.capital || 0;

      // 2. Liquidities / Cash on Hand (Active cash sessions or total sales cash paid minus achats cash paid)
      const cashSales = rawDb.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as cash FROM sales WHERE payment_type != 'credit'`).get() as any;
      const cashPurchases = rawDb.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as cash FROM purchases WHERE payment_type != 'credit'`).get() as any;
      const cashOnHand = Math.max(0, (cashSales?.cash || 0) - (cashPurchases?.cash || 0));

      // 3. Receivables (Client Debts)
      const clientDebts = rawDb.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'achat' THEN amount WHEN type = 'versement' THEN -amount WHEN type = 'dette_adjust' THEN amount ELSE 0 END), 0) as receivables
        FROM client_transactions
      `).get() as any;
      const receivables = Math.max(0, clientDebts?.receivables || 0);

      // 4. Short-term Debts (Supplier Debts)
      const supplierDebts = rawDb.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'achat' THEN amount WHEN type = 'versement' THEN -amount WHEN type = 'dette_adjust' THEN amount ELSE 0 END), 0) as debts
        FROM supplier_transactions
      `).get() as any;
      const shortTermDebts = Math.max(0, supplierDebts?.debts || 0);

      // 5. Net Zakatable
      const netZakatable = Math.max(0, capital + cashOnHand + receivables - shortTermDebts);

      // Nisab Threshold in Algeria (Approx ~1,000,000 DA = 100,000,000 centimes)
      const nisabThreshold = 100000000;
      const isAboveNisab = netZakatable >= nisabThreshold;
      const zakatDue = isAboveNisab ? Math.round(netZakatable * 0.025) : 0;

      return res.json({
        capital,
        cashOnHand,
        receivables,
        shortTermDebts,
        netZakatable,
        nisabThreshold,
        isAboveNisab,
        zakatDue,
        formula: "(Capital Stock + Liquidités Caisse + Créances Clients - Dettes Fournisseurs) × 2,5%"
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Save snapshot
router.post('/snapshots', authenticateToken, requirePermission('zakat', 'edit'), (req: AuthRequest, res) => {
  try {
    const { capital, cashOnHand, receivables, shortTermDebts, netZakatable, nisabThreshold, zakatDue, note } = req.body;
    const { rawDb, isPg } = getDb();

    if (!isPg) {
      const insert = rawDb.prepare(`
        INSERT INTO zakat_snapshots (capital, cash_on_hand, receivables, short_term_debts, net_zakatable, nisab_threshold, zakat_due, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(capital, cashOnHand, receivables, shortTermDebts, netZakatable, nisabThreshold, zakatDue, note || null);

      return res.status(201).json({ id: result.lastInsertRowid, message: 'Évaluation Zakat archivée avec succès' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// List snapshots
router.get('/snapshots', authenticateToken, requirePermission('zakat', 'view'), (req, res) => {
  try {
    const { rawDb, isPg } = getDb();
    if (!isPg) {
      const snapshots = rawDb.prepare('SELECT * FROM zakat_snapshots ORDER BY id DESC').all();
      return res.json(snapshots);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
