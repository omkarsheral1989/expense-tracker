/** Why no Drive token could be had. */
export type DriveTokenProblem =
  /** Google's script is missing: no client ID, or the page loaded offline. */
  | 'unavailable'
  /** The window was closed, or Drive access was not allowed. */
  | 'denied'
  /** The browser blocked Google's window. */
  | 'blocked'
  /** Another Google account was chosen in Google's window. */
  | 'wrongAccount'

/** The part of Google's token client (from its script) the app uses. */
export type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
}

export type GoogleTokenClient = { requestAccessToken: () => void }

export type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string
      scope: string
      hint?: string
      callback: (response: GoogleTokenResponse) => void
      error_callback?: (error: { type: string }) => void
    }) => GoogleTokenClient
    hasGrantedAllScopes: (response: GoogleTokenResponse, ...scopes: string[]) => boolean
  }
}
