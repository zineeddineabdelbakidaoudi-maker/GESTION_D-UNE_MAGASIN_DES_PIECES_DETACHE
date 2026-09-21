import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { SystemModule } from '@gestion-veloo/shared';
import {
  ShoppingCart, Package, Boxes, Truck, Users, Building2, BarChart3,
  Calculator, Settings, ScrollText, UsersRound, Wallet, Lock
} from 'lucide-react';

export interface TabDefinition {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ElementType;
  module: SystemModule;
  /** Raccourci affiché en infobulle (F1, F2, …). */
  shortcut?: string;
}

/**
 * Ordre des onglets : l'exploitation quotidienne d'abord, le pilotage ensuite.
 * C'est l'ordre dans lequel un caissier travaille.
 */
export const TABS: TabDefinition[] = [
  { id: 'pos', label: 'Caisse', labelAr: 'الصندوق', icon: ShoppingCart, module: 'pos', shortcut: 'F1' },
  { id: 'produits', label: 'Produits', labelAr: 'المنتجات', icon: Package, module: 'produits', shortcut: 'F2' },
  { id: 'stock', label: 'Stock', labelAr: 'المخزون', icon: Boxes, module: 'stock', shortcut: 'F3' },
  { id: 'achat', label: "Bons d'achat", labelAr: 'سندات الشراء', icon: Truck, module: 'achat', shortcut: 'F4' },
  { id: 'clients', label: 'Clients', labelAr: 'الزبائن', icon: Users, module: 'clients', shortcut: 'F5' },
  { id: 'fournisseurs', label: 'Fournisseurs', labelAr: 'الموردون', icon: Building2, module: 'fournisseurs', shortcut: 'F6' },
  { id: 'depenses', label: 'Dépenses', labelAr: 'المصاريف', icon: Wallet, module: 'depenses', shortcut: 'F8' },
  { id: 'rapport', label: 'Rapports', labelAr: 'التقارير', icon: BarChart3, module: 'rapport', shortcut: 'F7' },
  { id: 'zakat', label: 'Zakat', labelAr: 'الزكاة', icon: Calculator, module: 'zakat' },
  { id: 'journal', label: 'Journal', labelAr: 'السجل', icon: ScrollText, module: 'journal', shortcut: 'F10' },
  { id: 'utilisateurs', label: 'Utilisateurs', labelAr: 'المستخدمون', icon: UsersRound, module: 'users', shortcut: 'F11' },
  { id: 'settings', label: 'Paramètres', labelAr: 'الإعدادات', icon: Settings, module: 'settings', shortcut: 'F9' }
];

/**
 * Barre d'onglets principale, à la manière des fenêtres de propriétés Windows :
 * l'onglet actif est solidaire du contenu affiché en dessous.
 *
 * Elle remplace le menu latéral : sur un écran de caisse, la largeur récupérée
 * profite directement à la grille produits et au panier.
 */
export const TabStrip: React.FC = () => {
  const { activeTab, setActiveTab, hasPermission, lang } = useStore();
  const isAr = lang === 'ar';
  const listRef = useRef<HTMLDivElement>(null);

  const visible = TABS.filter(tab => hasPermission(tab.module, 'view'));

  // L'onglet actif reste visible même lorsque la barre déborde.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const index = visible.findIndex(t => t.id === activeTab);
    const step = (e.key === 'ArrowRight') === !isAr ? 1 : -1;
    const next = visible[(index + step + visible.length) % visible.length];
    if (next) setActiveTab(next.id);
  };

  return (
    <div className="gv-tabstrip" role="tablist" aria-label="Modules" onKeyDown={onKeyDown}>
      <div ref={listRef} className="gv-tabstrip-list gv-scroll-x">
        {visible.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const readOnly = !hasPermission(tab.module, 'edit');
          const label = isAr ? tab.labelAr : tab.label;

          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              data-active={isActive}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              title={`${label}${tab.shortcut ? ` — ${tab.shortcut}` : ''}${readOnly ? ' (consultation seule)' : ''}`}
              className={`gv-tab ${isActive ? 'gv-tab-active' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
              {readOnly && <Lock className="w-3 h-3 shrink-0 opacity-50" aria-label="Consultation seule" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
