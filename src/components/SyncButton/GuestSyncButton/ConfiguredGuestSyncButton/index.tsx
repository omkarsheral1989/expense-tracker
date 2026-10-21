import { useSignIn } from '../../../../hooks/useSignIn'
import type { SyncButtonProps } from '../../types.ts'
import { GuestSyncButtonView } from '../GuestSyncButtonView'

export function ConfiguredGuestSyncButton(props: SyncButtonProps) {
  const { signIn } = useSignIn()
  return <GuestSyncButtonView {...props} onSignIn={signIn} />
}
