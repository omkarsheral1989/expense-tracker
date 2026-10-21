import { GOOGLE_CLIENT_ID } from '../../../config.ts'
import { ConfiguredGuestSyncButton } from './ConfiguredGuestSyncButton'
import { NotConfiguredGuestSyncButton } from './NotConfiguredGuestSyncButton'
import type { SyncButtonProps } from '../types.ts'

/** A guest's Sync button (see `GuestSyncButtonView`). */
export function GuestSyncButton(props: SyncButtonProps) {
  return GOOGLE_CLIENT_ID ? <ConfiguredGuestSyncButton {...props} /> : <NotConfiguredGuestSyncButton {...props} />
}
