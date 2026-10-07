import { GOOGLE_CLIENT_ID } from '../../../../../config.ts'
import { ConfiguredSignInButton } from './ConfiguredSignInButton'
import { NotConfiguredSignInButton } from './NotConfiguredSignInButton'

export function SignInButton() {
  return GOOGLE_CLIENT_ID ? (
    <ConfiguredSignInButton />
  ) : (
    <NotConfiguredSignInButton />
  )
}
