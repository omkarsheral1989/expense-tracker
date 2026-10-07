import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Profile = {
  /** Google's stable account id (`sub`). Used to name the per-account database. */
  id: string
  email: string
  name: string
  picture?: string
}

export type AccessToken = {
  value: string
  /** Epoch milliseconds. */
  expiresAt: number
}

type AuthState = {
  profile: Profile | null
  token: AccessToken | null
  signIn: (profile: Profile, token: AccessToken) => void
  signOut: () => void
}

/**
 * The signed-in profile is kept on the device so the app opens offline without
 * a new Google login. The access token lives in memory only: it lasts about an
 * hour and is requested again when a Drive action needs it.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      token: null,
      signIn: (profile, token) => set({ profile, token }),
      signOut: () => set({ profile: null, token: null }),
    }),
    {
      name: 'ownledger-session',
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
)

/** The token if it is still usable (with a one-minute safety margin). */
export function validToken(token: AccessToken | null, now = Date.now()) {
  return token && token.expiresAt - 60_000 > now ? token.value : null
}
