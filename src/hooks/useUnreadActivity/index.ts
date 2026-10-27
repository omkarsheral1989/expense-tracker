import { getDb } from '../../db/client.ts'
import { activityService } from '../../services/activityService'
import { useSyncStore } from '../../stores/useSyncStore'
import { useCachedData } from '../useCachedData'
import { useCurrentUser } from '../useCurrentUser'

/**
 * Whether an event by another member reached this device since the user last left
 * the Activity page (PRD 5.18): the avatar menu shows a dot while it is true. False
 * until the user's data is open.
 */
export function useUnreadActivity(): boolean {
  const user = useCurrentUser()
  const userId = user?.personId ?? ''
  const dataVersion = useSyncStore((state) => state.dataVersion)
  const { state } = useCachedData(
    async () => (user ? (await activityService.unreadState(await getDb(), userId)).hasUnread : false),
    'activityUnread',
    `${userId}:${dataVersion}`,
    { keepPrevious: true },
  )
  return state.status === 'ready' && state.data
}
