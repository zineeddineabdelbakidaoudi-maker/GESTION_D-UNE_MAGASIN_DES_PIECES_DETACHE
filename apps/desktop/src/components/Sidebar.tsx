import React from 'react';
import { useStore } from '../store/useStore';
import { 
  ShoppingCart, 
  Package, 
  Boxes, 
  Truck, 
  Users, 
  Building2, 
  BarChart3, 
  Calculator, 
  Settings,
  Bike
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, hasPermission, lang, theme } = useStore();
  const isAr = lang === 'ar';
  const isDark = theme === 'dark';

  const navItems = [
    { id: 'pos', label: isAr ? 'نقطة البيع (POS)' : 'Caisse (POS)', icon: ShoppingCart, module: 'pos' },
    { id: 'produits', label: isAr ? 'المنتجات والتقديرات' : 'Produits & Proforma', icon: Package, module: 'produits' },
    { id: 'stock', label: isAr ? 'إدارة المخزون' : 'Gestion Stock', icon: Boxes, module: 'stock' },
    { id: 'achat', label: isAr ? 'سندات الشراء' : 'Bons d\'Achat', icon: Truck, module: 'achat' },
    { id: 'clients', label: isAr ? 'الزبائن والديون' : 'Clients & Crédits', icon: Users, module: 'clients' },
    { id: 'fournisseurs', label: isAr ? 'الموردين' : 'Fournisseurs', icon: Building2, module: 'fournisseurs' },
    { id: 'rapport', label: isAr ? 'التقارير المالية' : 'Rapports Financiers', icon: BarChart3, module: 'rapport' },
    { id: 'zakat', label: isAr ? 'حساب الزكاة' : 'Calcul Zakat', icon: Calculator, module: 'zakat' },
    { id: 'settings', label: isAr ? 'الإعدادات' : 'Paramètres', icon: Settings, module: 'settings' }
  ];

  return (
    <aside className={`w-56 flex flex-col shrink-0 select-none h-full border-r transition-colors ${
      isDark ? 'bg-slate-900 text-slate-300 border-slate-800' : 'bg-white text-slate-700 border-slate-200'
    }`}>
      {/* Brand */}
      <div className={`p-4 border-b flex items-center gap-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/30">
          <Bike className="w-5 h-5" />
        </div>
        <div>
          <h1 className={`font-bold text-sm leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {isAr ? 'قطع الدراجات والموتو' : 'Cycles & Motos'}
          </h1>
          <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">{isAr ? 'نظام نقاط البيع' : 'Point de Vente POS'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
        {navItems.map(item => {
          if (!hasPermission(item.module as any, 'view')) return null;
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : isDark 
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className={`p-3 border-t text-[11px] text-center ${
        isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
      }`}>
        <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {isAr ? 'يعمل بدون إنترنت' : 'Offline-First Engine'}
        </p>
        <p>{isAr ? 'العملة :' : 'Devise :'} <span className="text-emerald-500 font-mono font-bold">DZD (DA)</span></p>
      </div>
    </aside>
  );
};
