import { TrialState } from '@gestion-veloo/shared';

const API_BASE = ((import.meta as any).env?.VITE_API_URL ? (import.meta as any).env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('gv_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
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

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erreur réseau' }));
    throw new Error(err.error || `Erreur HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchTrialStatus(): Promise<TrialState> {
  const res = await fetch(`${API_BASE}/trial-status`);
  return res.json();
}
