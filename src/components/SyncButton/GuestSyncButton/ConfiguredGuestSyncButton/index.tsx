import { useSignIn } from '../../../../hooks/useSignIn'
import { GuestSyncButtonView } from '../GuestSyncButtonView'

export function ConfiguredGuestSyncButton() {
  const { signIn } = useSignIn()
  return <GuestSyncButtonView onSignIn={signIn} />
}
