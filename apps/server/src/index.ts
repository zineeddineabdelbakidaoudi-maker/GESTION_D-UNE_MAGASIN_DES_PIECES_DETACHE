import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { trialMiddleware, getTrialStatusHandler } from './middleware/trial';

import { runSeed } from './db/seed';

import authRoutes from './routes/auth';
import storesRoutes from './routes/stores';
import usersRoutes from './routes/users';
import productsRoutes from './routes/products';
import stockRoutes from './routes/stock';
import purchasesRoutes from './routes/purchases';
import salesRoutes from './routes/sales';
import clientsRoutes from './routes/clients';
import suppliersRoutes from './routes/suppliers';
import reportsRoutes from './routes/reports';
import auditRoutes from './routes/audit';
import zakatRoutes from './routes/zakat';
import settingsRoutes from './routes/settings';
import syncRoutes from './routes/sync';
import depensesRoutes from './routes/depenses';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Global Middlewares
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Trial status endpoint (Always accessible for client countdown & checks)
app.get('/api/trial-status', getTrialStatusHandler);

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    server: 'Gestion Pièces Cycles & Motos — Central API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root welcome & API status route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>API Serveur Central — Pièces Cycles & Motos</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 40px; max-width: 540px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; }
        .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 12px; margin-bottom: 20px; border: 1px solid rgba(16, 185, 129, 0.3); }
        h1 { font-size: 22px; font-weight: 900; margin: 0 0 10px 0; color: #fff; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 25px 0; }
        .endpoints { text-align: left; background: #0f172a; border-radius: 12px; padding: 15px; font-family: monospace; font-size: 12px; color: #38bdf8; margin-bottom: 20px; }
        .endpoints div { margin-bottom: 6px; }
        .endpoints a { color: #38bdf8; text-decoration: none; }
        .endpoints a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">● SERVEUR EN LIGNE (PRODUCTION)</div>
        <h1>🚀 Serveur Central & API REST</h1>
        <p>Le backend de synchronisation et de gestion multi-boutique est opérationnel.</p>
        <div class="endpoints">
          <div>GET <a href="/api/health">/api/health</a> → État du serveur</div>
          <div>GET <a href="/api/trial-status">/api/trial-status</a> → Statut licence</div>
          <div>POST /api/auth/login → Authentification</div>
          <div>POST /api/sync/push → Synchronisation caisses POS</div>
        </div>
        <p style="font-size: 12px; color: #64748b; margin: 0;">Gestion Vélo & Moto — Déployé sur Render Cloud</p>
      </div>
    </body>
    </html>
  `);
});

// Enforce 24h Trial on all other endpoints
app.use(trialMiddleware);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/depenses', depensesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/zakat', zakatRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sync', syncRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
});

// Auto-seed initial data on startup
try {
  runSeed();
} catch (e) {
  console.warn('Seed warning:', e);
}

app.listen(PORT, () => {
  console.log(`🚀 Serveur Central Gestion Vélo & Moto opérationnel sur le port ${PORT}`);
});

export default app;
