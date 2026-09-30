import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import { LoginPage } from './pages/LoginPage';
import { TrialBanner } from './components/TrialBanner';
import { Header } from './components/Header';
import { TabStrip } from './components/TabStrip';
import { Toaster, AccessDenied, LoadingState } from './components/ui';
import { ChangePasswordModal } from './components/ChangePasswordModal';
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
import { JournalPage } from './pages/JournalPage';
import { UsersPage } from './pages/UsersPage';
import { ProduitClassique } from './pages/classique/ProduitClassique';
import { invokeIpcSafe, onSessionExpired } from './api/electronBridge';
import { MODULE_LABELS, type SystemModule } from '@gestion-veloo/shared';

/**
 * L'onglet Produits rend l'écran correspondant à l'habillage choisi :
 * la fiche classique (barre d'icônes, sous-onglets, libellés à gauche) ou
 * le catalogue moderne.
 */
const EcranProduits: React.FC = () => {
  const skin = useStore(s => s.uiSkin);
  return skin === 'classique' ? <ProduitClassique /> : <ProductsPage />;
};

/** Chaque onglet déclare le module qui conditionne son accès. */
const TAB_REGISTRY: Array<{ id: string; module: SystemModule; render: () => JSX.Element }> = [
  { id: 'pos', module: 'pos', render: () => <POSPage /> },
  { id: 'produits', module: 'produits', render: () => <EcranProduits /> },
  { id: 'produits-liste', module: 'produits', render: () => <ProductsPage /> },
  { id: 'stock', module: 'stock', render: () => <StockPage /> },
  { id: 'achat', module: 'achat', render: () => <PurchasesPage /> },
  { id: 'clients', module: 'clients', render: () => <ClientsPage /> },
  { id: 'fournisseurs', module: 'fournisseurs', render: () => <SuppliersPage /> },
  { id: 'rapport', module: 'rapport', render: () => <ReportsPage /> },
  { id: 'depenses', module: 'depenses', render: () => <DepensesPage /> },
  { id: 'zakat', module: 'zakat', render: () => <ZakatPage /> },
  { id: 'journal', module: 'journal', render: () => <JournalPage /> },
  { id: 'utilisateurs', module: 'users', render: () => <UsersPage /> },
  { id: 'settings', module: 'settings', render: () => <SettingsPage /> }
];

const SHORTCUT_TO_TAB: Record<string, string> = {
  goto_pos: 'pos',
  goto_produits: 'produits',
  goto_stock: 'stock',
  goto_achat: 'achat',
  goto_clients: 'clients',
  goto_fournisseurs: 'fournisseurs',
  goto_rapport: 'rapport',
  goto_depenses: 'depenses',
  goto_journal: 'journal',
  goto_users: 'utilisateurs',
  goto_settings: 'settings'
};

export const App: React.FC = () => {
  const {
    currentUser, activeTab, setActiveTab, theme, lang, uiSkin,
    sessionChecked, restoreSession, signOut, hasPermission, pushToast
  } = useStore();

  const isDark = theme === 'dark';
  const isAr = lang === 'ar';
  const [passwordModal, setPasswordModal] = useState(false);
  const shortcutsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const racine = document.documentElement;
    // L'habillage classique reprend les gris des boîtes de dialogue Windows :
    // il est clair par nature, le mode sombre ne s'y applique pas.
    racine.classList.toggle('skin-classique', uiSkin === 'classique');
    racine.classList.toggle('dark', isDark && uiSkin !== 'classique');
    racine.lang = isAr ? 'ar' : 'fr';
    racine.dir = isAr ? 'rtl' : 'ltr';
  }, [isDark, isAr, uiSkin]);

  // Une session peut survivre à un rechargement de la fenêtre : on la récupère.
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Expiration côté process principal : on renvoie l'utilisateur à la connexion.
  useEffect(() => {
    return onSessionExpired(err => {
      pushToast({ kind: 'warning', title: 'Session terminée', description: err.message });
      signOut();
    });
  }, [signOut, pushToast]);

  useEffect(() => {
    if (!currentUser) return;
    invokeIpcSafe<Record<string, string>>('get-shortcuts', undefined, {}).then(sc => {
      shortcutsRef.current = sc || {};
    });
  }, [currentUser]);

  const handleGlobalShortcut = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const shortcuts = shortcutsRef.current;
      if (!shortcuts || !Object.keys(shortcuts).length) return;

      const pressed = [
        e.ctrlKey && 'Control',
        e.shiftKey && 'Shift',
        e.altKey && 'Alt',
        !['Control', 'Shift', 'Alt'].includes(e.key) && e.key
      ].filter(Boolean).join('+');

      const action = Object.entries(shortcuts).find(([, sc]) => sc === pressed)?.[0];
      const tab = action ? SHORTCUT_TO_TAB[action] : undefined;
      if (!tab) return;

      const entry = TAB_REGISTRY.find(t => t.id === tab);
      if (!entry) return;

      e.preventDefault();
      // Un raccourci ne doit jamais ouvrir un module interdit.
      if (!hasPermission(entry.module, 'view')) {
        pushToast({
          kind: 'warning',
          title: 'Module non autorisé',
          description: `Vous n'avez pas accès à « ${MODULE_LABELS[entry.module]} ».`
        });
        return;
      }
      setActiveTab(tab);
    },
    [setActiveTab, hasPermission, pushToast]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [handleGlobalShortcut]);

  if (!sessionChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--gv-bg))' }}>
        <LoadingState label="Ouverture de la caisse…" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginPage />
        <Toaster />
      </>
    );
  }

  const current = TAB_REGISTRY.find(t => t.id === activeTab);
  const allowed = current ? hasPermission(current.module, 'view') : false;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'rgb(var(--gv-bg))', color: 'rgb(var(--gv-text))' }}>
      <TrialBanner />

      <Header onChangePassword={() => setPasswordModal(true)} />
      <TabStrip />

      <main className="flex-1 overflow-hidden min-h-0" style={{ backgroundColor: 'rgb(var(--gv-surface))' }}>
        {!current ? (
          <AccessDenied />
        ) : allowed ? (
          current.render()
        ) : (
          <AccessDenied module={MODULE_LABELS[current.module]} />
        )}
      </main>

      <ChangePasswordModal
        open={passwordModal || currentUser.mustChangePassword}
        forced={currentUser.mustChangePassword}
        onClose={() => setPasswordModal(false)}
        onDone={() => {
          setPasswordModal(false);
          // Le drapeau « mot de passe à changer » est levé côté session : on la recharge.
          restoreSession();
        }}
      />

      <Toaster />
    </div>
  );
};
