import { GOOGLE_CLIENT_ID } from '../../config.ts'
import { DRIVE_SCOPE } from '../../services/driveService/constants.ts'
import { googleProfileService } from '../../services/googleProfileService'
import { useAuthStore, validToken } from '../../stores/useAuthStore'
import type { DriveTokenProblem, GoogleAccounts } from './types.ts'

/** No Drive token: see `problem`. */
export class DriveTokenError extends Error {
  readonly problem: DriveTokenProblem
  constructor(problem: DriveTokenProblem) {
    super(`No Drive access (${problem}).`)
    this.name = 'DriveTokenError'
    this.problem = problem
  }
}

function googleAccounts(): GoogleAccounts | undefined {
  return (window as unknown as { google?: { accounts?: GoogleAccounts } }).google?.accounts
}

/**
 * A token for the signed-in user's Google Drive (ADR-044). The one from the
 * last request is reused while it lasts; otherwise Google's window asks for
 * Drive access, which it only opens from a click, so `getDriveToken` must be
 * called directly in a click handler, before anything is awaited.
 *
 * Google's script is used directly rather than through `useGoogleLogin`, so the
 * pages that sync also render where there is no Google provider (no client ID,
 * tests). The token is checked to belong to the signed-in account, since the
 * window lets the user pick any of their accounts.
 */
export function useDriveToken() {
  const profile = useAuthStore((state) => state.profile)
  const driveToken = useAuthStore((state) => state.driveToken)
  const setDriveToken = useAuthStore((state) => state.setDriveToken)

  function getDriveToken(): Promise<string> {
    const valid = validToken(driveToken)
    if (valid) return Promise.resolve(valid)

    const accounts = googleAccounts()
    if (!profile || !GOOGLE_CLIENT_ID || !accounts) {
      return Promise.reject(new DriveTokenError('unavailable'))
    }

    return new Promise((resolve, reject) => {
      const client = accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        // The basic scopes too, to read whose Drive this is.
        scope: `openid email profile ${DRIVE_SCOPE}`,
        hint: profile.email,
        callback: async (response) => {
          if (!response.access_token || !accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
            reject(new DriveTokenError('denied'))
            return
          }
          try {
            const owner = await googleProfileService.fetchProfile(response.access_token)
            if (owner.id !== profile.id) {
              reject(new DriveTokenError('wrongAccount'))
              return
            }
          } catch {
            reject(new DriveTokenError('unavailable'))
            return
          }
          setDriveToken({
            value: response.access_token,
            expiresAt: Date.now() + Number(response.expires_in ?? 0) * 1000,
          })
          resolve(response.access_token)
        },
        // The window was closed, or the browser did not let it open.
        error_callback: (error) =>
          reject(new DriveTokenError(error.type === 'popup_failed_to_open' ? 'blocked' : 'denied')),
      })
      client.requestAccessToken()
    })
  }

  /** Forgets the token, for example when Drive said it expired. */
  function forgetDriveToken() {
    setDriveToken(null)
  }

  return { getDriveToken, forgetDriveToken }
}
