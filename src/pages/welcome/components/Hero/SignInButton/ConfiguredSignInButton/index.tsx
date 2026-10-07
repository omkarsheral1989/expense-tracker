import { Button } from 'antd'
import { useSignIn } from '../../../../../../hooks/useSignIn'
import { GoogleLogo } from '../../../../../../components/GoogleLogo'
import { SIGN_IN_LABEL } from '../content.ts'

export function ConfiguredSignInButton() {
  const { signIn, loading } = useSignIn()

  return (
    <Button
      size="large"
      icon={<GoogleLogo />}
      loading={loading}
      onClick={signIn}
    >
      {SIGN_IN_LABEL}
    </Button>
  )
}
