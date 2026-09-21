import { invokeIpc } from './electronBridge';

const DEFAULT_SERVER = 'https://gestion-veloo-server.onrender.com';
const STORAGE_KEY = 'gv_desktop_server_url';
const KEY_STORAGE = 'gv_desktop_sync_key';

export function getServerUrl(): string {
  const custom = localStorage.getItem(STORAGE_KEY);
  if (custom?.trim()) {
    let url = custom.trim();
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    return url.replace(/\/$/, '');
  }
  return DEFAULT_SERVER;
}

export function setServerUrl(url: string): void {
  if (url?.trim()) localStorage.setItem(STORAGE_KEY, url.trim());
  else localStorage.removeItem(STORAGE_KEY);
}

/** Clé partagée avec le serveur central (SYNC_API_KEY) pour authentifier ce poste. */
export function getSyncKey(): string {
  return localStorage.getItem(KEY_STORAGE) || '';
}

export function setSyncKey(key: string): void {
  if (key?.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export interface SyncResult {
  success: boolean;
  message: string;
  pushedCount: number;
  auditCount: number;
  timestamp: string;
}

const PUSH_TIMEOUT_MS = 20000;

async function postJson(url: string, body: any): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const key = getSyncKey();
  if (key) headers['X-Sync-Key'] = key;
  if (body?.deviceId) headers['X-Device-Id'] = String(body.deviceId);

  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pousse vers le portail central tout ce que l'administrateur doit voir :
 * ventes, achats, retours, mouvements de stock, dépenses, historique des coûts
 * et — surtout — le journal d'audit complet.
 *
 * La caisse reste pleinement opérationnelle si le serveur est injoignable :
 * les entrées non transmises restent marquées « en attente » localement.
 */
export async function runFullSync(storeId = 1): Promise<SyncResult> {
  const serverUrl = getServerUrl();
  const timestamp = new Date().toLocaleTimeString('fr-DZ');

  let payload: any = null;

  try {
    payload = await invokeIpc<any>('get-sync-payload', { storeId, limit: 500 });

    const response = await postJson(`${serverUrl}/api/sync/push`, payload);
    if (!response.ok) {
      const detail = await response.json().catch(() => ({} as any));
      if (response.status === 401) {
        throw new Error(
          detail?.error ||
          "Ce poste n'est pas autorisé par le serveur central. Renseignez la clé de synchronisation dans Paramètres."
        );
      }
      throw new Error(detail?.error || `Le serveur a répondu ${response.status}.`);
    }
    const ack = await response.json().catch(() => ({} as any));

    const auditCount = payload.auditEntries?.length || 0;
    const pushedCount =
      (payload.sales?.length || 0) +
      (payload.purchases?.length || 0) +
      (payload.returns?.length || 0) +
      (payload.depenses?.length || 0) +
      auditCount;

    await invokeIpc('mark-sync-result', {
      success: true,
      auditCursor: payload.auditCursor,
      pushedCount,
      serverUrl
    });

    return {
      success: true,
      pushedCount,
      auditCount,
      timestamp,
      message:
        `${pushedCount} enregistrement(s) transmis au portail, dont ${auditCount} entrée(s) de journal.` +
        (ack?.authenticated === false ? " Attention : le serveur accepte ce poste sans clé de synchronisation." : '')
    };
  } catch (err: any) {
    const message = err?.name === 'AbortError'
      ? 'Le serveur central n\'a pas répondu dans le délai imparti.'
      : err?.message || 'Communication impossible avec le serveur central.';

    // L'échec est lui aussi journalisé : l'administrateur voit les tentatives ratées.
    await invokeIpc('mark-sync-result', { success: false, error: message, serverUrl }).catch(() => {});

    return {
      success: false,
      pushedCount: 0,
      auditCount: payload?.auditEntries?.length || 0,
      timestamp,
      message
    };
  }
}
