import { App, Button } from 'antd'
import { useSignIn } from '../../../../../auth/useSignIn.ts'
import { GoogleLogo } from '../../../../../components/GoogleLogo.tsx'
import { GOOGLE_CLIENT_ID } from '../../../../../config.ts'

const LABEL = 'Sign in with Google'

function ConfiguredSignInButton() {
  const { signIn, loading } = useSignIn()

  return (
    <Button
      size="large"
      icon={<GoogleLogo />}
      loading={loading}
      onClick={signIn}
    >
      {LABEL}
    </Button>
  )
}

/**
 * Google's login hook throws when there is no client ID, so without one the
 * button is rendered separately and only explains what is missing.
 */
function NotConfiguredSignInButton() {
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
      {LABEL}
    </Button>
  )
}

export function SignInButton() {
  return GOOGLE_CLIENT_ID ? (
    <ConfiguredSignInButton />
  ) : (
    <NotConfiguredSignInButton />
  )
}
