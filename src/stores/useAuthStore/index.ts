import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SESSION_KEY } from './constants.ts'
import type { AccessToken, AuthState } from './types.ts'

export { SESSION_KEY }

/**
 * The signed-in profile (or the fact that the user is a guest) is kept on the
 * device so the app opens offline without a new Google login. The access token lives in memory only: it lasts about an
 * hour and is requested again when a Drive action needs it.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      guest: false,
      token: null,
      signIn: (profile, token) => set({ profile, guest: false, token }),
      startGuest: () => set({ profile: null, guest: true, token: null }),
      signOut: () => set({ profile: null, guest: false, token: null }),
    }),
    {
      name: SESSION_KEY,
      partialize: (state) => ({ profile: state.profile, guest: state.guest }),
    },
  ),
)

/** The token if it is still usable (with a one-minute safety margin). */
export function validToken(token: AccessToken | null, now = Date.now()) {
  return token && token.expiresAt - 60_000 > now ? token.value : null
}
