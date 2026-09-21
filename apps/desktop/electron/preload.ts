import { contextBridge, ipcRenderer } from 'electron';

/**
 * Liste blanche des canaux exposés au renderer. Tout canal absent d'ici est
 * rejeté avant même d'atteindre le process principal — qui applique de toute
 * façon l'authentification et les permissions.
 */
const ALLOWED_CHANNELS = new Set<string>([
  // Licence & amorçage
  'get-trial-status', 'get-bootstrap',
  // Authentification
  'auth-login', 'auth-logout', 'auth-session', 'auth-change-password',
  // Utilitaires
  'generate-barcode-image', 'print-receipt', 'get-metadata', 'get-printers',
  // Produits
  'get-products', 'create-product', 'update-product', 'update-product-photo',
  'archive-product', 'get-cost-history',
  // Stock
  'get-stock', 'adjust-stock', 'transfer-stock', 'get-stock-movements', 'get-low-stock',
  // Ventes
  'create-sale', 'get-sales', 'process-return', 'void-sale', 'get-daily-kpi',
  // Achats
  'create-purchase', 'get-purchases',
  // Clients & fournisseurs
  'get-clients', 'create-client', 'update-client', 'create-client-versement', 'get-client-transactions',
  'get-suppliers', 'create-supplier', 'create-supplier-versement', 'get-supplier-transactions',
  // Dépenses
  'get-expense-categories', 'add-expense-category', 'delete-expense-category',
  'get-depenses', 'create-depense',
  'delete-depense', 'get-depenses-total',
  // Rapports & paramètres
  'get-reports', 'get-settings', 'save-settings', 'get-shortcuts', 'save-shortcuts',
  // Référentiels
  'get-locations', 'get-saved-locations', 'add-saved-location',
  'add-category', 'delete-category', 'add-brand', 'delete-brand',
  'add-color', 'delete-color', 'add-motorcycle-model', 'delete-motorcycle-model',
  // Utilisateurs & rôles
  'get-users', 'create-user', 'update-user', 'reset-user-password',
  'set-user-permissions', 'get-role-template', 'get-login-attempts',
  // Journal d'audit
  'get-audit-log', 'get-audit-stats', 'get-audit-filters',
  // Synchronisation
  'get-sync-payload', 'mark-sync-result'
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data?: any) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`));
    }
    return ipcRenderer.invoke(channel, data);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  platform: process.platform,
  isElectron: true
});
