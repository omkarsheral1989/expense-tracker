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

const SESSION_KEY = 'ownledger-session'

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
      name: SESSION_KEY,
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
)

/**
 * Keeps every open tab in step with the stored session. The browser tells the
 * other tabs when one changes it, so signing out in one tab signs out all of
 * them, and signing in shows up in the others. Exported for tests.
 */
export function syncSessionFromOtherTab(event: {
  key: string | null
  newValue: string | null
}) {
  // A null key means the whole storage was cleared.
  if (event.key !== null && event.key !== SESSION_KEY) return

  if (event.newValue === null) {
    useAuth.setState({ profile: null, token: null })
    return
  }

  // Load the other tab's profile. The access token is not shared between tabs,
  // so a tab that is signed out has none, and a new one asks for its own.
  void Promise.resolve(useAuth.persist.rehydrate()).then(() => {
    if (!useAuth.getState().profile) useAuth.setState({ token: null })
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', syncSessionFromOtherTab)
}

/** The token if it is still usable (with a one-minute safety margin). */
export function validToken(token: AccessToken | null, now = Date.now()) {
  return token && token.expiresAt - 60_000 > now ? token.value : null
}
