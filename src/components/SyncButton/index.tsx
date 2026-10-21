import { useCurrentUser } from '../../hooks/useCurrentUser'
import { DriveSyncButton } from './DriveSyncButton'
import { GuestSyncButton } from './GuestSyncButton'

/**
 * The header's round Sync button (PRD 5.8). Shown once the data is open: a
 * signed-in user's backs up to their Drive, a guest's asks them to sign in.
 */
export function SyncButton() {
  const user = useCurrentUser()
  if (!user) return null
  return user.isGuest ? <GuestSyncButton /> : <DriveSyncButton />
}
