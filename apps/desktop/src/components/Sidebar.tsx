import React from 'react';
import { useStore } from '../store/useStore';
import type { SystemModule } from '@gestion-veloo/shared';
import {
  ShoppingCart, Package, Boxes, Truck, Users, Building2, BarChart3,
  Calculator, Settings, Bike, ScrollText, UsersRound, Wallet, Lock
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ElementType;
  module: SystemModule;
  group: 'exploitation' | 'gestion' | 'pilotage';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'pos', label: 'Caisse (POS)', labelAr: 'نقطة البيع', icon: ShoppingCart, module: 'pos', group: 'exploitation' },
  { id: 'produits', label: 'Produits', labelAr: 'المنتجات', icon: Package, module: 'produits', group: 'exploitation' },
  { id: 'stock', label: 'Stock', labelAr: 'المخزون', icon: Boxes, module: 'stock', group: 'exploitation' },
  { id: 'achat', label: "Bons d'achat", labelAr: 'سندات الشراء', icon: Truck, module: 'achat', group: 'exploitation' },

  { id: 'clients', label: 'Clients & Crédits', labelAr: 'الزبائن والديون', icon: Users, module: 'clients', group: 'gestion' },
  { id: 'fournisseurs', label: 'Fournisseurs', labelAr: 'الموردين', icon: Building2, module: 'fournisseurs', group: 'gestion' },
  { id: 'depenses', label: 'Dépenses', labelAr: 'المصاريف', icon: Wallet, module: 'depenses', group: 'gestion' },

  { id: 'rapport', label: 'Rapports', labelAr: 'التقارير', icon: BarChart3, module: 'rapport', group: 'pilotage' },
  { id: 'zakat', label: 'Zakat', labelAr: 'الزكاة', icon: Calculator, module: 'zakat', group: 'pilotage' },
  { id: 'journal', label: "Journal d'audit", labelAr: 'سجل التدقيق', icon: ScrollText, module: 'journal', group: 'pilotage' },
  { id: 'utilisateurs', label: 'Utilisateurs & Rôles', labelAr: 'المستخدمون', icon: UsersRound, module: 'users', group: 'pilotage' },
  { id: 'settings', label: 'Paramètres', labelAr: 'الإعدادات', icon: Settings, module: 'settings', group: 'pilotage' }
];

const GROUP_LABELS: Record<string, { fr: string; ar: string }> = {
  exploitation: { fr: 'Exploitation', ar: 'التشغيل' },
  gestion: { fr: 'Gestion commerciale', ar: 'التسيير التجاري' },
  pilotage: { fr: 'Pilotage & Contrôle', ar: 'القيادة والمراقبة' }
};

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, hasPermission, lang, currentUser } = useStore();
  const isAr = lang === 'ar';

  const visible = NAV_ITEMS.filter(item => hasPermission(item.module, 'view'));
  const groups = (['exploitation', 'gestion', 'pilotage'] as const)
    .map(group => ({ group, items: visible.filter(i => i.group === group) }))
    .filter(g => g.items.length > 0);

  // Le nombre de modules masqués rend la restriction explicite plutôt que déroutante.
  const hiddenCount = NAV_ITEMS.length - visible.length;

  return (
    <aside
      className="w-60 flex flex-col shrink-0 select-none h-full"
      style={{ backgroundColor: 'rgb(var(--gv-surface))', borderInlineEnd: '1px solid rgb(var(--gv-border))' }}
    >
      <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgb(var(--gv-border))' }}>
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/25 shrink-0">
          <Bike className="w-5.5 h-5.5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-black text-sm leading-tight truncate">
            {isAr ? 'قطع الدراجات والموتو' : 'Cycles & Motos'}
          </h1>
          <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">
            {isAr ? 'نظام نقاط البيع' : 'Point de vente'}
          </p>
        </div>
      </div>

      <nav className="p-3 flex-1 overflow-y-auto gv-scroll space-y-4">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <p className="px-2 mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] gv-muted">
              {isAr ? GROUP_LABELS[group].ar : GROUP_LABELS[group].fr}
            </p>
            <div className="space-y-1">
              {items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const readOnly = !hasPermission(item.module, 'edit');
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                      isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 font-bold' : 'hover:bg-[rgb(var(--gv-surface-2))]'
                    }`}
                    style={isActive ? undefined : { color: 'rgb(var(--gv-text-muted))' }}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : ''}`} />
                    <span className="truncate flex-1 text-start">{isAr ? item.labelAr : item.label}</span>
                    {readOnly && (
                      <Lock
                        className={`w-3 h-3 shrink-0 ${isActive ? 'text-blue-200' : 'opacity-45'}`}
                        aria-label="Consultation seule"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 space-y-2" style={{ borderTop: '1px solid rgb(var(--gv-border))' }}>
        {hiddenCount > 0 && (
          <p className="text-[10px] gv-muted leading-snug px-1">
            {hiddenCount} module(s) masqué(s) par vos permissions.
          </p>
        )}
        <div className="text-[10px] gv-muted text-center leading-relaxed">
          <p className="font-semibold">{isAr ? 'يعمل بدون إنترنت' : 'Fonctionne hors ligne'}</p>
          <p>
            {isAr ? 'العملة :' : 'Devise :'}{' '}
            <span className="text-emerald-500 font-mono font-bold">DZD</span>
            {currentUser?.role === 'auditor' && <span className="gv-badge-neutral ms-1">Lecture seule</span>}
          </p>
        </div>
      </div>
    </aside>
  );
};
