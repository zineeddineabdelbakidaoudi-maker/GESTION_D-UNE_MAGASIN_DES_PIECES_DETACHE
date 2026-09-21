import { Request, Response, NextFunction } from 'express';

export interface SyncRequest extends Request {
  sync?: {
    deviceId: string;
    authenticated: boolean;
  };
}

let warnedOnce = false;

/**
 * Authentifie une caisse qui pousse ses données.
 *
 * La clé est partagée entre le serveur (`SYNC_API_KEY`) et chaque poste
 * (Paramètres → Synchronisation). Tant qu'aucune clé n'est configurée côté
 * serveur, les envois sont acceptés mais marqués « non authentifiés » et
 * signalés dans les journaux : cela évite de couper les déploiements existants
 * tout en rendant la faille visible.
 */
export function authenticateSyncDevice(req: SyncRequest, res: Response, next: NextFunction) {
  const expected = process.env.SYNC_API_KEY;
  const provided = String(req.headers['x-sync-key'] || '');
  const deviceId = String(req.headers['x-device-id'] || req.body?.deviceId || 'inconnu');

  if (!expected) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        '[sync] SYNC_API_KEY non définie : le point /api/sync/push accepte des envois non authentifiés. ' +
        'Définissez SYNC_API_KEY côté serveur et reportez la même clé dans les paramètres de chaque caisse.'
      );
    }
    req.sync = { deviceId, authenticated: false };
    return next();
  }

  // Comparaison à longueur fixe simple : les clés sont courtes et le point
  // d'entrée est limité en débit par le déploiement.
  if (!provided || provided !== expected) {
    return res.status(401).json({
      error: "Clé de synchronisation invalide. Renseignez la clé du serveur dans les paramètres de la caisse."
    });
  }

  req.sync = { deviceId, authenticated: true };
  next();
}
