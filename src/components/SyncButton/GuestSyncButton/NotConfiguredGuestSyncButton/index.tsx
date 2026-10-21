import { App } from 'antd'
import { GuestSyncButtonView } from '../GuestSyncButtonView'

/**
 * Google's login hook throws when there is no client ID, so without one the
 * button is rendered separately and "Sign in with Google" only explains what
 * is missing.
 */
export function NotConfiguredGuestSyncButton() {
  const { message } = App.useApp()

  return (
    <GuestSyncButtonView
      onSignIn={() =>
        message.error('Google sign-in is not configured yet (VITE_GOOGLE_CLIENT_ID is missing).')
      }
    />
  )
}
