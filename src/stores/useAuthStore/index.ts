import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { logService } from '../../services/logService'
import { SESSION_KEY } from './constants.ts'
import type { AccessToken, AuthState } from './types.ts'

export { SESSION_KEY }

const log = logService.scope('auth')

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
      driveToken: null,
      setDriveToken: (driveToken) => {
        log.info(driveToken ? 'Drive access granted' : 'Drive access cleared')
        set({ driveToken })
      },
      signIn: (profile, token) => {
        log.info('Signed in with Google')
        set({ profile, guest: false, token, driveToken: null })
      },
      startGuest: () => {
        log.info('Continuing as a guest')
        set({ profile: null, guest: true, token: null, driveToken: null })
      },
      signOut: () => {
        log.info('Signed out')
        set({ profile: null, guest: false, token: null, driveToken: null })
      },
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
