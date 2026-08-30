import { create } from 'zustand';
import { User, Permission, SystemModule } from '@gestion-veloo/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  selectedStoreId: number | null; // null = all stores
  theme: 'dark' | 'light';
  login: (token: string, user: User) => void;
  logout: () => void;
  setSelectedStoreId: (id: number | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  hasPermission: (module: SystemModule, action: 'view' | 'edit') => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const savedToken = localStorage.getItem('gv_token');
  const savedUserStr = localStorage.getItem('gv_user');
  const savedTheme = (localStorage.getItem('gv_theme') as 'dark' | 'light') || 'dark';
  let initialUser: User | null = null;
  if (savedUserStr) {
    try {
      initialUser = JSON.parse(savedUserStr);
    } catch {}
  }

  return {
    user: initialUser,
    token: savedToken,
    selectedStoreId: null,
    theme: savedTheme,
    login: (token, user) => {
      localStorage.setItem('gv_token', token);
      localStorage.setItem('gv_user', JSON.stringify(user));
      set({ token, user });
    },
    logout: () => {
      localStorage.removeItem('gv_token');
      localStorage.removeItem('gv_user');
      set({ token: null, user: null });
    },
    setSelectedStoreId: (id) => set({ selectedStoreId: id }),
    setTheme: (theme) => {
      localStorage.setItem('gv_theme', theme);
      set({ theme });
    },
    toggleTheme: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gv_theme', next);
      set({ theme: next });
    },
    hasPermission: (module, action) => {
      const { user } = get();
      if (!user) return false;
      if (user.role === 'owner') return true;
      const perm = user.permissions?.find(p => p.module === module);
      if (!perm) return false;
      return action === 'view' ? perm.canView : perm.canEdit;
    }
  };
});
