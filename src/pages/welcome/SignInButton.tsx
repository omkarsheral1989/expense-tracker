import { Button } from 'antd'
import { GoogleLogo } from '../../components/GoogleLogo.tsx'

type Props = {
  onClick?: () => void
  loading?: boolean
}

export function SignInButton({ onClick, loading }: Props) {
  return (
    <Button
      size="large"
      shape="round"
      icon={<GoogleLogo />}
      loading={loading}
      onClick={onClick}
    >
      Sign in with Google
    </Button>
  )
}
