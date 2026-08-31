import { invokeIpc } from './electronBridge';

export function getServerUrl(): string {
  const custom = localStorage.getItem('gv_desktop_server_url');
  if (custom && custom.trim()) {
    let u = custom.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
    return u.replace(/\/$/, '');
  }
  return 'https://gestion-veloo-server.onrender.com';
}

export function setServerUrl(url: string): void {
  if (url && url.trim()) {
    localStorage.setItem('gv_desktop_server_url', url.trim());
  } else {
    localStorage.removeItem('gv_desktop_server_url');
  }
}

export interface SyncResult {
  success: boolean;
  message?: string;
  pushedCount?: number;
  pulledCount?: number;
  timestamp: string;
}

export async function runFullSync(storeId: number = 1): Promise<SyncResult> {
  const serverUrl = getServerUrl();
  const timestamp = new Date().toLocaleTimeString('fr-DZ');

  try {
    // 1. Gather local data to push
    const [sales, depenses, products] = await Promise.all([
      invokeIpc<any[]>('get-sales', { storeId }).catch(() => []),
      invokeIpc<any[]>('get-depenses', { storeId }).catch(() => []),
      invokeIpc<any[]>('get-products', { storeId }).catch(() => [])
    ]);

    // Format Push Payload
    const pushPayload = {
      storeId,
      sales: sales || [],
      returns: [],
      purchases: [],
      stockMovements: [],
      clientTransactions: [],
      supplierTransactions: [],
      stockTransfers: [],
      depenses: depenses || []
    };

    // 2. Push to Cloud Server
    const pushRes = await fetch(serverUrl + '/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushPayload)
    });

    if (!pushRes.ok) {
      const err = await pushRes.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur push cloud HTTP ' + pushRes.status);
    }

    // 3. Pull Catalog from Cloud Server
    const pullRes = await fetch(serverUrl + '/api/sync/pull?storeId=' + storeId);
    if (!pullRes.ok) {
      throw new Error('Erreur pull cloud HTTP ' + pullRes.status);
    }

    const cloudCatalog = await pullRes.json();
    const updates = cloudCatalog?.catalogUpdates || cloudCatalog;
    const pushedCount = (sales ? sales.length : 0) + (depenses ? depenses.length : 0);
    const pulledCount = (updates && updates.products) ? updates.products.length : 0;

    return {
      success: true,
      pushedCount,
      pulledCount,
      timestamp,
      message: `Synchronisation avec le Cloud réussie ! (${pushedCount} transaction(s) locale(s) transmise(s), ${pulledCount} article(s) synchronisé(s))`
    };
  } catch (err: any) {
    console.error('Sync Error:', err);
    return {
      success: false,
      timestamp,
      message: err.message || 'Erreur lors de la communication avec le serveur Cloud'
    };
  }
}