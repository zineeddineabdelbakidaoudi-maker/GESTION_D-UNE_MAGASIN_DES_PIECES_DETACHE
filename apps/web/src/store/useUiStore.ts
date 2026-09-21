import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface UiState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  notifyError: (err: unknown, fallbackTitle?: string) => void;
}

let seq = 0;

/** Notifications du portail, alignées sur celles de l'application de caisse. */
export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],

  pushToast: (toast) => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    setTimeout(() => get().dismissToast(id), toast.kind === 'error' ? 8000 : 4000);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) }),

  notifyError: (err, fallbackTitle = 'Opération impossible') => {
    const message = err instanceof Error ? err.message : String(err);
    get().pushToast({ kind: 'error', title: fallbackTitle, description: message });
  }
}));
