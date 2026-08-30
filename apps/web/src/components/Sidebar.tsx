import React from 'react';
import { LayoutDashboard, History, Users, Boxes, Bike, Network, ArrowLeftRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { theme } = useAuthStore();
  const isDark = theme === 'dark';

  const menuItems = [
    { id: 'reports', label: 'Tableau de Bord & Rapports', icon: LayoutDashboard },
    { id: 'sync', label: 'Réseau & Sync Desktop (.exe)', icon: Network },
    { id: 'stock', label: 'Vue Stock & Transferts', icon: Boxes },
    { id: 'audit', label: 'Journal d\'Audit (Code 90)', icon: History },
    { id: 'users', label: 'Droits & Utilisateurs (10 Modules)', icon: Users }
  ];

  return (
    <aside className={`w-64 flex flex-col shrink-0 min-h-screen border-r transition-colors ${
      isDark ? 'bg-slate-900 text-slate-300 border-slate-800' : 'bg-white text-slate-700 border-slate-200'
    }`}>
      <div className={`p-5 border-b flex items-center gap-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20">
          <Bike className="w-6 h-6" />
        </div>
        <div>
          <h1 className={`font-bold text-base leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Cycles & Motos
          </h1>
          <p className="text-xs text-blue-500 font-semibold">Portail Web Propriétaire</p>
        </div>
      </div>

      <nav className="p-4 space-y-1.5 flex-1">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : isDark 
                    ? 'hover:bg-slate-800 hover:text-white text-slate-400' 
                    : 'hover:bg-slate-100 hover:text-slate-900 text-slate-600'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={`p-4 border-t text-xs space-y-1 ${
        isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
      }`}>
        <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Multi-Boutique Algérie</p>
        <p>2 Magasins connectés • DZD</p>
      </div>
    </aside>
  );
};
