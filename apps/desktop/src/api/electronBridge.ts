// Universal IPC Bridge: Seamlessly supports Tauri v2, Electron, and HTTP API fallback

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
    electronAPI?: {
      invoke: (channel: string, data?: any) => Promise<any>;
      on: (channel: string, func: (...args: any[]) => void) => () => void;
    };
  }
}

// Map kebab-case channel names to snake_case Tauri commands
const CHANNEL_TO_TAURI_COMMAND: Record<string, string> = {
  'get-trial-status': 'get_trial_status',
  'get-metadata': 'get_metadata',
  'get-products': 'get_products',
  'create-product': 'create_product',
  'update-product': 'update_product',
  'get-stock': 'get_stock',
  'adjust-stock': 'adjust_stock',
  'transfer-stock': 'transfer_stock',
  'get-stock-movements': 'get_stock_movements',
  'create-sale': 'create_sale',
  'get-sales': 'get_sales',
  'process-return': 'process_return',
  'create-purchase': 'create_purchase',
  'get-purchases': 'get_purchases',
  'get-clients': 'get_clients',
  'create-client': 'create_client',
  'create-client-versement': 'create_client_versement',
  'get-client-transactions': 'get_client_transactions',
  'get-suppliers': 'get_suppliers',
  'create-supplier': 'create_supplier',
  'create-supplier-versement': 'create_supplier_versement',
  'get-supplier-transactions': 'get_supplier_transactions',
  'get-reports': 'get_reports',
  'get-settings': 'get_settings',
  'save-settings': 'save_settings',
  'print-receipt': 'print_receipt',
  'get-printers': 'get_printers',
  'get-expense-categories': 'get_expense_categories',
  'get-depenses': 'get_depenses',
  'create-depense': 'create_depense',
  'delete-depense': 'delete_depense',
  'get-depenses-total': 'get_depenses_total',
  'get-shortcuts': 'get_shortcuts',
  'save-shortcuts': 'save_shortcuts'
};

export async function invokeIpc<T>(channel: string, data?: any): Promise<T> {
  // 1. Check if running in Tauri v2
  if (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const tauriCmd = CHANNEL_TO_TAURI_COMMAND[channel] || channel.replace(/-/g, '_');
      
      if (channel === 'get-settings') {
        const storeId = typeof data === 'number' ? data : (data?.storeId || 1);
        return await invoke<T>(tauriCmd, { storeId });
      }
      if (channel === 'get-client-transactions') {
        const clientId = typeof data === 'number' ? data : data?.clientId;
        return await invoke<T>(tauriCmd, { clientId });
      }
      if (channel === 'get-supplier-transactions') {
        const supplierId = typeof data === 'number' ? data : data?.supplierId;
        return await invoke<T>(tauriCmd, { supplierId });
      }
      if (channel === 'get-stock' || channel === 'get-sales' || channel === 'get-purchases') {
        return await invoke<T>(tauriCmd, { storeId: data?.storeId, q: data?.q });
      }
      if (channel === 'get-reports') {
        return await invoke<T>(tauriCmd, { storeId: data?.storeId, period: data?.period });
      }
      if (channel === 'get-stock-movements') {
        return await invoke<T>(tauriCmd, { 
          storeId: data?.storeId, 
          movementCode: data?.movementCode,
          limit: data?.limit 
        });
      }
      if (channel === 'get-products') {
        return await invoke<T>(tauriCmd, {
          q: data?.q,
          categoryId: data?.categoryId,
          colorId: data?.colorId,
          storeId: data?.storeId,
          sort: data?.sort
        });
      }
      if (channel === 'get-depenses') {
        return await invoke<T>(tauriCmd, {
          storeId: data?.storeId,
          categoryId: data?.categoryId,
          dateFrom: data?.dateFrom,
          dateTo: data?.dateTo
        });
      }
      if (channel === 'get-depenses-total') {
        return await invoke<T>(tauriCmd, {
          storeId: data?.storeId,
          dateFrom: data?.dateFrom,
          dateTo: data?.dateTo
        });
      }
      if (channel === 'delete-depense') {
        const id = typeof data === 'number' ? data : data?.id;
        return await invoke<T>(tauriCmd, { id });
      }
      if (channel === 'save-shortcuts') {
        return await invoke<T>(tauriCmd, { shortcuts: data });
      }
      if (channel === 'get-expense-categories' || channel === 'get-shortcuts' || channel === 'get-printers' || channel === 'get-metadata' || channel === 'get-trial-status') {
        return await invoke<T>(tauriCmd);
      }

      return await invoke<T>(tauriCmd, { payload: data });
    } catch (tauriErr) {
      console.warn(`[Tauri invoke warning for "${channel}"]:`, tauriErr);
    }
  }

  // 2. Check if running in Electron
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
    return window.electronAPI.invoke(channel, data);
  }

  // 3. Fallback to Express API Server for dev browser preview
  try {
    const res = await fetch(`http://localhost:3001/api/${channel.replace(/-/g, '/')}`, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    });
    return res.json();
  } catch (err) {
    console.error('IPC / API call failed:', err);
    throw err;
  }
}
