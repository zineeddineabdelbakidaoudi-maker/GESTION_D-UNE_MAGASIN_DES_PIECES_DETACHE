import { useStore } from '../store/useStore';

/**
 * Notifications utilisables hors composant React (handlers, utilitaires).
 * Remplace les `alert()` bloquants : sur un poste de caisse, une boîte modale
 * native fige la fenêtre et interrompt la lecture de la douchette.
 */
export const notify = {
  success(title: string, description?: string) {
    useStore.getState().pushToast({ kind: 'success', title, description });
  },
  info(title: string, description?: string) {
    useStore.getState().pushToast({ kind: 'info', title, description });
  },
  warn(title: string, description?: string) {
    useStore.getState().pushToast({ kind: 'warning', title, description });
  },
  error(err: unknown, title = 'Opération impossible') {
    useStore.getState().notifyError(err, title);
  }
};
