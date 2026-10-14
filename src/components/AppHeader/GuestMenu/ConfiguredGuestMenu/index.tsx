import { useSignIn } from '../../../../hooks/useSignIn'
import { GuestMenuView } from '../GuestMenuView'

export function ConfiguredGuestMenu() {
  const { signIn, loading } = useSignIn()
  return <GuestMenuView onSignIn={signIn} loading={loading} />
}
