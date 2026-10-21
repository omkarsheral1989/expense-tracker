import { GOOGLE_CLIENT_ID } from '../../../config.ts'
import { ConfiguredGuestSyncButton } from './ConfiguredGuestSyncButton'
import { NotConfiguredGuestSyncButton } from './NotConfiguredGuestSyncButton'

/** A guest's Sync button (see `GuestSyncButtonView`). */
export function GuestSyncButton() {
  return GOOGLE_CLIENT_ID ? <ConfiguredGuestSyncButton /> : <NotConfiguredGuestSyncButton />
}
