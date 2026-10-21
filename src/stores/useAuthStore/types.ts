import type { Profile } from '../../services/googleProfileService/types.ts'

export type AccessToken = {
  value: string
  /** Epoch milliseconds. */
  expiresAt: number
}

export type AuthState = {
  /** The signed-in Google account, or null. */
  profile: Profile | null
  /** Using the app without an account, on this device (ADR-035). Never true together with a profile. */
  guest: boolean
  token: AccessToken | null
  /**
   * A token that may also use Google Drive, asked for on the first Sync press
   * (ADR-044). In memory only, like `token`; null until then.
   */
  driveToken: AccessToken | null
  setDriveToken: (token: AccessToken | null) => void
  signIn: (profile: Profile, token: AccessToken) => void
  /** Continue as a guest. */
  startGuest: () => void
  /** Leaves the session: signs out of Google, or exits guest mode. The data stays on the device. */
  signOut: () => void
}
