import type { Profile } from '../../services/googleProfileService/types.ts'

export type AccessToken = {
  value: string
  /** Epoch milliseconds. */
  expiresAt: number
}

export type AuthState = {
  profile: Profile | null
  token: AccessToken | null
  signIn: (profile: Profile, token: AccessToken) => void
  signOut: () => void
}
