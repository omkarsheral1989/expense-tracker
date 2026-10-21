import { useCurrentUser } from '../../hooks/useCurrentUser'
import { DriveSyncButton } from './DriveSyncButton'
import { GuestSyncButton } from './GuestSyncButton'
import type { SyncButtonProps } from './types.ts'

/**
 * The round Sync button (PRD 5.8), in the header (everything) or on a group's
 * band (that group). Shown once the data is open: a signed-in user's syncs
 * through their Drive, a guest's asks them to sign in.
 */
export function SyncButton(props: SyncButtonProps) {
  const user = useCurrentUser()
  if (!user) return null
  return user.isGuest ? <GuestSyncButton {...props} /> : <DriveSyncButton {...props} />
}
