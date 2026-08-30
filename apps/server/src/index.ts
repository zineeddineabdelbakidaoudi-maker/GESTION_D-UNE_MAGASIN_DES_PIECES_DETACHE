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
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Trial status endpoint (Always accessible for client countdown & checks)
app.get('/api/trial-status', getTrialStatusHandler);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
