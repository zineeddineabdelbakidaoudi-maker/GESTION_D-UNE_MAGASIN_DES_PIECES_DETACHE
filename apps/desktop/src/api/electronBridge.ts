/**
 * Pont IPC unique du poste de caisse (Electron).
 *
 * Toute la logique métier vit dans le process principal : ce module se contente
 * de transporter l'appel et de rendre les erreurs exploitables par l'interface.
 */

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on: (channel: string, func: (...args: any[]) => void) => () => void;
      platform?: string;
      isElectron?: boolean;
    };
  }
}

export type IpcErrorCode =
  | 'AUTH_REQUIRED'
  | 'SESSION_IDLE'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'WEAK_PASSWORD'
  | 'FORBIDDEN'
  | 'UNKNOWN';

export class IpcError extends Error {
  code: IpcErrorCode;
  channel: string;

  constructor(message: string, code: IpcErrorCode, channel: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.channel = channel;
  }

  /** Vrai si l'utilisateur doit se reconnecter. */
  get requiresLogin(): boolean {
    return this.code === 'AUTH_REQUIRED' || this.code === 'SESSION_IDLE';
  }
}

const KNOWN_CODES: IpcErrorCode[] = [
  'AUTH_REQUIRED', 'SESSION_IDLE', 'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED', 'ACCOUNT_DISABLED', 'WEAK_PASSWORD', 'FORBIDDEN'
];

/** Écoute des expirations de session, pour renvoyer l'utilisateur à l'écran de connexion. */
type SessionExpiredListener = (error: IpcError) => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.invoke);
}

/**
 * Electron encapsule les erreurs du process principal dans un message de la forme
 * « Error invoking remote method 'x': Error: CODE::message ». On restitue ici le
 * message métier d'origine et son code.
 */
function unwrapError(raw: unknown, channel: string): IpcError {
  const rawMessage = raw instanceof Error ? raw.message : String(raw);
  const withoutWrapper = rawMessage.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '');

  const match = withoutWrapper.match(/^([A-Z_]+)::(.*)$/s);
  if (match && KNOWN_CODES.includes(match[1] as IpcErrorCode)) {
    return new IpcError(match[2], match[1] as IpcErrorCode, channel);
  }
  return new IpcError(withoutWrapper || 'Erreur inattendue', 'UNKNOWN', channel);
}

export async function invokeIpc<T>(channel: string, data?: any): Promise<T> {
  if (!isElectron()) {
    throw new IpcError(
      "Cette application doit être lancée depuis l'exécutable Electron (le pont IPC est indisponible dans un navigateur).",
      'UNKNOWN',
      channel
    );
  }

  try {
    return (await window.electronAPI!.invoke(channel, data)) as T;
  } catch (raw) {
    const error = unwrapError(raw, channel);
    if (error.requiresLogin) {
      sessionExpiredListeners.forEach(listener => {
        try {
          listener(error);
        } catch {}
      });
    }
    throw error;
  }
}

/** Variante silencieuse : renvoie une valeur de repli au lieu de propager l'erreur. */
export async function invokeIpcSafe<T>(channel: string, data: any, fallback: T): Promise<T> {
  try {
    return await invokeIpc<T>(channel, data);
  } catch (err) {
    console.warn(`[ipc:${channel}]`, (err as Error).message);
    return fallback;
  }
}
