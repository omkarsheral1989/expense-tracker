import { App, Button } from 'antd'
import { GoogleLogo } from '../../../../../../components/GoogleLogo.tsx'
import { SIGN_IN_LABEL } from '../content.ts'

/**
 * Google's login hook throws when there is no client ID, so without one the
 * button is rendered separately and only explains what is missing.
 */
export function NotConfiguredSignInButton() {
  const { message } = App.useApp()

  return (
    <Button
      size="large"
      icon={<GoogleLogo />}
      onClick={() =>
        message.error(
          'Google sign-in is not configured yet (VITE_GOOGLE_CLIENT_ID is missing).',
        )
      }
    >
      {SIGN_IN_LABEL}
    </Button>
  )
}
