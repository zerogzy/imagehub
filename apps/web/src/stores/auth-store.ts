import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  role: 'visitor' | 'admin' | null;
  tokenPrefix: string | null;
  name: string | null;
  sessionExpiresAt: number | null;
  sessionCacheHours: number;
  _hasHydrated: boolean;
  setAuth: (token: string, role: 'visitor' | 'admin', prefix: string, name: string) => void;
  clearAuth: () => void;
  setSessionCacheHours: (hours: number) => void;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  isSessionExpired: () => boolean;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      role: null,
      tokenPrefix: null,
      name: null,
      sessionExpiresAt: null,
      sessionCacheHours: 3,
      _hasHydrated: false,
      setAuth: (token, role, prefix, name) => {
        const hours = get().sessionCacheHours || 3;
        set({
          token,
          role,
          tokenPrefix: prefix,
          name,
          sessionExpiresAt: Date.now() + hours * 3600 * 1000,
        });
      },
      clearAuth: () =>
        set({ token: null, role: null, tokenPrefix: null, name: null, sessionExpiresAt: null }),
      setSessionCacheHours: (hours: number) => set({ sessionCacheHours: hours }),
      isAuthenticated: () => {
        const s = get();
        if (!s.token) return false;
        if (s.sessionExpiresAt && Date.now() > s.sessionExpiresAt) {
          s.clearAuth();
          return false;
        }
        return true;
      },
      isAdmin: () => get().role === 'admin' && get().isAuthenticated(),
      isSessionExpired: () => {
        const s = get();
        return !!s.sessionExpiresAt && Date.now() > s.sessionExpiresAt;
      },
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'imagehub-auth',
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.sessionExpiresAt && Date.now() > state.sessionExpiresAt) {
            state.token = null;
            state.role = null;
            state.tokenPrefix = null;
            state.name = null;
            state.sessionExpiresAt = null;
          }
          state._hasHydrated = true;
        }
      },
      partialize: (state) => ({
        token: state.token,
        role: state.role,
        tokenPrefix: state.tokenPrefix,
        name: state.name,
        sessionExpiresAt: state.sessionExpiresAt,
        sessionCacheHours: state.sessionCacheHours,
      }),
    },
  ),
);
