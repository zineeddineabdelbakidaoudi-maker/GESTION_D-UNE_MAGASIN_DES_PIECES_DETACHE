import { TrialState } from '@gestion-veloo/shared';

function getApiBase(): string {
  let rawApiUrl = (import.meta as any).env?.VITE_API_URL || '';

  // If provided as "gestion-veloo-server.onrender.com" (from Render property: host)
  if (rawApiUrl && !rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://')) {
    rawApiUrl = `https://${rawApiUrl}`;
  }

  // Fallback if not configured
  if (!rawApiUrl) {
    if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
      rawApiUrl = 'https://gestion-veloo-server.onrender.com';
    } else {
      rawApiUrl = 'http://localhost:3001';
    }
  }

  return `${rawApiUrl.replace(/\/$/, '')}/api`;
}

const API_BASE = getApiBase();

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('gv_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${getApiBase()}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 403) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.error === 'trial_expired') {
      window.dispatchEvent(new CustomEvent('trial_expired', { detail: errorData }));
      throw new Error(errorData.message || 'Période d\'essai expirée');
    }
  }

  if (response.status === 401) {
    localStorage.removeItem('gv_token');
    localStorage.removeItem('gv_user');
    window.dispatchEvent(new Event('unauthorized'));
    throw new Error('Session expirée ou non autorisée');
  }

  const text = await response.text();

  if (!response.ok) {
    let errMsg = `Erreur HTTP ${response.status}`;
    try {
      const err = JSON.parse(text);
      if (err.error) errMsg = err.error;
    } catch {}
    throw new Error(errMsg);
  }

  try {
    return text ? JSON.parse(text) : ({} as T);
  } catch (err) {
    console.error(`Invalid JSON from ${url}:`, text.slice(0, 200));
    throw new Error(`Format de réponse invalide reçu du serveur.`);
  }
}

export async function fetchTrialStatus(): Promise<TrialState> {
  const res = await fetch(`${getApiBase()}/trial-status`);
  return res.json();
}
