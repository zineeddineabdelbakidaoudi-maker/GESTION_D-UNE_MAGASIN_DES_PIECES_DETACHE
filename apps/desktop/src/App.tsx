import React, { useEffect, useCallback } from 'react';
import { useStore } from './store/useStore';
import { LoginPage } from './pages/LoginPage';
import { TrialBanner } from './components/TrialBanner';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { POSPage } from './pages/POSPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockPage } from './pages/StockPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ClientsPage } from './pages/ClientsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { ReportsPage } from './pages/ReportsPage';
import { ZakatPage } from './pages/ZakatPage';
import { SettingsPage } from './pages/SettingsPage';
import { DepensesPage } from './pages/DepensesPage';
import { invokeIpc } from './api/electronBridge';

export const App: React.FC = () => {
  const { currentUser, activeTab, setActiveTab, theme, lang } = useStore();
  const isDark = theme === 'dark';
  const isAr = lang === 'ar';

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Global Keyboard Shortcuts handler
  const handleGlobalShortcut = useCallback(async (e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in an input, textarea, or select
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    try {
      const shortcuts = await invokeIpc<Record<string, string>>('get-shortcuts');
      if (!shortcuts) return;

      const pressed = [
        e.ctrlKey && 'Control',
        e.shiftKey && 'Shift',
        e.altKey && 'Alt',
        e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key
      ].filter(Boolean).join('+');

      const action = Object.entries(shortcuts).find(([_, sc]) => sc === pressed)?.[0];
      if (!action) return;

      const navMap: Record<string, string> = {
        goto_pos: 'pos', goto_produits: 'produits', goto_stock: 'stock',
        goto_achat: 'achat', goto_clients: 'clients', goto_fournisseurs: 'fournisseurs',
        goto_rapport: 'rapport', goto_depenses: 'depenses', goto_settings: 'settings'
      };
      if (navMap[action]) {
        e.preventDefault();
        setActiveTab(navMap[action]);
      }
    } catch {}
  }, [setActiveTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [handleGlobalShortcut]);

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div 
      dir={isAr ? 'rtl' : 'ltr'} 
      className={`h-screen w-screen flex flex-col overflow-hidden select-none transition-colors ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* 24h Trial Persistent Banner & Countdown */}
      <TrialBanner />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Left Sidebar */}
        <Sidebar />

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar with Live Capital & Douchette Indicator */}
          <Header />

          {/* Module Views */}
          <main className={`flex-1 overflow-hidden transition-colors ${
            isDark ? 'bg-slate-950' : 'bg-slate-50'
          }`}>
            {activeTab === 'pos' && <POSPage />}
            {activeTab === 'produits' && <ProductsPage />}
            {activeTab === 'stock' && <StockPage />}
            {activeTab === 'achat' && <PurchasesPage />}
            {activeTab === 'clients' && <ClientsPage />}
            {activeTab === 'fournisseurs' && <SuppliersPage />}
            {activeTab === 'rapport' && <ReportsPage />}
            {activeTab === 'depenses' && <DepensesPage />}
            {activeTab === 'zakat' && <ZakatPage />}
            {activeTab === 'settings' && <SettingsPage />}
          </main>
        </div>
      </div>
    </div>
  );
};
