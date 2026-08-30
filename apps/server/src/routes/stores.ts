import { Router } from 'express';
import { getDb } from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, (req, res) => {
  const { rawDb, isPg } = getDb();
  if (!isPg) {
    const storesList = rawDb.prepare('SELECT * FROM stores ORDER BY id ASC').all();
    return res.json(storesList);
  }
});

export default router;
