import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { UsersPage } from './pages/UsersPage';
import { StockOverviewPage } from './pages/StockOverviewPage';
import { SyncNetworkPage } from './pages/SyncNetworkPage';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { TrialBanner } from './components/TrialBanner';

export const App: React.FC = () => {
  const { user, theme } = useAuthStore();
  const [currentTab, setCurrentTab] = useState('reports');
  const isDark = theme === 'dark';

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <TrialBanner />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <Navbar />
          <main className="flex-1">
            {currentTab === 'reports' && <ReportsPage />}
            {currentTab === 'sync' && <SyncNetworkPage />}
            {currentTab === 'stock' && <StockOverviewPage />}
            {currentTab === 'audit' && <AuditPage />}
            {currentTab === 'users' && <UsersPage />}
          </main>
        </div>
      </div>
    </div>
  );
};
