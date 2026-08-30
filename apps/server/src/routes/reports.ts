import { Router } from 'express';
import { getDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, requirePermission('rapport', 'view'), (req, res) => {
  try {
    const { rawDb, isPg } = getDb();
    const period = (req.query.period as string) || 'month'; // 'day', 'week', 'month', 'custom'
    const storeId = req.query.storeId ? parseInt(req.query.storeId as string, 10) : null;
    const customStart = req.query.startDate as string;
    const customEnd = req.query.endDate as string;

    if (!isPg) {
      // Determine date range filter
      let dateCondition = '';
      if (period === 'day') {
        dateCondition = `date(s.created_at) = date('now')`;
      } else if (period === 'week') {
        dateCondition = `date(s.created_at) >= date('now', '-7 days')`;
      } else if (period === 'month') {
        dateCondition = `date(s.created_at) >= date('now', 'start of month')`;
      } else if (period === 'custom' && customStart && customEnd) {
        dateCondition = `date(s.created_at) BETWEEN date('${customStart}') AND date('${customEnd}')`;
      } else {
        dateCondition = `date(s.created_at) >= date('now', 'start of month')`;
      }

      let storeFilter = '';
      const params: any[] = [];
      if (storeId) {
        storeFilter = ` AND s.store_id = ?`;
        params.push(storeId);
      }

      // 1. Sales & Turnover (CA)
      const salesQuery = `
        SELECT 
          COUNT(s.id) as salesCount,
          COALESCE(SUM(s.total), 0) as totalCA
        FROM sales s
        WHERE ${dateCondition} ${storeFilter}
      `;
      const salesStat = rawDb.prepare(salesQuery).get(...params) as any;

      // 2. Profit (Bénéfices = Σ (unit_price - price_achat) * qty)
      const profitQuery = `
        SELECT 
          COALESCE(SUM((si.unit_price - p.price_achat) * si.qty), 0) as totalBenefice
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE ${dateCondition} ${storeFilter}
      `;
      const profitStat = rawDb.prepare(profitQuery).get(...params) as any;

      // 3. Achats Total
      let purchaseDateCond = dateCondition.replace(/s\.created_at/g, 'pu.created_at');
      let purchaseStoreFilter = storeFilter.replace(/s\.store_id/g, 'pu.store_id');
      const purchasesStat = rawDb.prepare(`
        SELECT COALESCE(SUM(pu.total), 0) as totalAchats
        FROM purchases pu
        WHERE ${purchaseDateCond} ${purchaseStoreFilter}
      `).get(...params) as any;

      // 3b. Dépenses Total
      let depDateCond = dateCondition.replace(/s\.created_at/g, 'd.depense_date');
      let depStoreFilter = storeFilter.replace(/s\.store_id/g, 'd.store_id');
      const depStat = rawDb.prepare(`
        SELECT COALESCE(SUM(d.amount), 0) as totalDepenses
        FROM depenses d
        WHERE ${depDateCond} ${depStoreFilter}
      `).get(...params) as any;
      const totalDepenses = depStat?.totalDepenses || 0;
      const totalBeneficesBrut = profitStat?.totalBenefice || 0;
      const totalBenefices = Math.max(0, totalBeneficesBrut - totalDepenses);

      // 4. Client Debts Total (Overall unpaid)
      const clientDebts = rawDb.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'achat' THEN amount WHEN type = 'versement' THEN -amount WHEN type = 'dette_adjust' THEN amount ELSE 0 END), 0) as totalDetteClients
        FROM client_transactions
      `).get() as any;

      // 5. Supplier Debts Total
      const supplierDebts = rawDb.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'achat' THEN amount WHEN type = 'versement' THEN -amount WHEN type = 'dette_adjust' THEN amount ELSE 0 END), 0) as totalDetteFournisseurs
        FROM supplier_transactions
      `).get() as any;

      // 6. Chart Series Data (Grouped by date)
      const chartQuery = `
        SELECT 
          date(s.created_at) as date,
          COALESCE(SUM(s.total), 0) as ca,
          COUNT(s.id) as ventesCount
        FROM sales s
        WHERE ${dateCondition} ${storeFilter}
        GROUP BY date(s.created_at)
        ORDER BY date(s.created_at) ASC
      `;
      const chartRows = rawDb.prepare(chartQuery).all(...params) as any[];

      // Compute profit per day for the chart
      const chartData = chartRows.map(row => {
        const dayProfit = rawDb.prepare(`
          SELECT COALESCE(SUM((si.unit_price - p.price_achat) * si.qty), 0) as benefice
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          JOIN products p ON si.product_id = p.id
          WHERE date(s.created_at) = ? ${storeFilter}
        `).get(row.date, ...params) as any;

        return {
          date: row.date,
          ca: row.ca,
          benefice: dayProfit?.benefice || 0,
          ventesCount: row.ventesCount
        };
      });

      // 7. Top Selling Products
      const topProductsQuery = `
        SELECT 
          p.id as productId,
          p.code as code,
          p.name as productName,
          SUM(si.qty) as qtySold,
          SUM(si.line_total) as revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE ${dateCondition} ${storeFilter}
        GROUP BY p.id
        ORDER BY qtySold DESC
        LIMIT 10
      `;
      const topProducts = rawDb.prepare(topProductsQuery).all(...params) as any[];

      return res.json({
        period,
        storeId,
        salesCount: salesStat?.salesCount || 0,
        totalCA: salesStat?.totalCA || 0,
        totalBeneficesBrut,
        totalDepenses,
        totalBenefices,
        totalAchats: purchasesStat?.totalAchats || 0,
        totalDetteClients: Math.max(0, clientDebts?.totalDetteClients || 0),
        totalDetteFournisseurs: Math.max(0, supplierDebts?.totalDetteFournisseurs || 0),
        chartData,
        topProducts
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
