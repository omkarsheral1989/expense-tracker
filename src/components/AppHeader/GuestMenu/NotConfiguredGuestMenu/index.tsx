import { App } from 'antd'
import { GuestMenuView } from '../GuestMenuView'

/**
 * Google's login hook throws when there is no client ID, so without one the
 * menu is rendered separately and "Sign in with Google" only explains what is
 * missing.
 */
export function NotConfiguredGuestMenu() {
  const { message } = App.useApp()

  return (
    <GuestMenuView
      onSignIn={() =>
        message.error('Google sign-in is not configured yet (VITE_GOOGLE_CLIENT_ID is missing).')
      }
    />
  )
}
