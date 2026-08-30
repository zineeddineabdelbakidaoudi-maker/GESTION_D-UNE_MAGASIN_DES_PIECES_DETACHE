import { Request, Response, NextFunction } from 'express';
import { calculateTrialState } from '@gestion-veloo/shared';

// Baked server start or build timestamp
const BUILD_TIME = process.env.BUILD_TIME ? parseInt(process.env.BUILD_TIME, 10) : Date.now();

export function trialMiddleware(req: Request, res: Response, next: NextFunction) {
  const trial = calculateTrialState(BUILD_TIME);

  // Attach trial info to response headers
  res.setHeader('X-Trial-Expired', trial.isExpired.toString());
  res.setHeader('X-Trial-Remaining-Hours', trial.remainingHours.toString());

  // Allow getting trial status freely
  if (req.path === '/api/trial-status' || req.path === '/api/auth/login') {
    return next();
  }

  if (trial.isExpired) {
    return res.status(403).json({
      error: 'TRIAL_EXPIRED',
      message: "Version d'essai expirée — contactez le développeur pour la version complète.",
      trialState: trial
    });
  }

  next();
}

export function getTrialStatusHandler(_req: Request, res: Response) {
  const trial = calculateTrialState(BUILD_TIME);
  res.json(trial);
}
