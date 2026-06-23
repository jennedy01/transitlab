import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as apiLogin, register as apiRegister, setAuthToken, type AuthUser } from '../lib/api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** True when authenticated as a real account (vs. the local fallback user). */
  isAuthed: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthed: false,

      login: async (email, password) => {
        const { token, user } = await apiLogin(email, password);
        setAuthToken(token);
        set({ token, user, isAuthed: true });
      },
      register: async (email, password, displayName) => {
        const { token, user } = await apiRegister(email, password, displayName);
        setAuthToken(token);
        set({ token, user, isAuthed: true });
      },
      logout: () => {
        setAuthToken(null);
        set({ token: null, user: null, isAuthed: false });
      },
    }),
    {
      name: 'transitlab-auth',
      // Re-arm the API client with the persisted token on reload.
      onRehydrateStorage: () => (state) => {
        if (state?.token) setAuthToken(state.token);
      },
    },
  ),
);
