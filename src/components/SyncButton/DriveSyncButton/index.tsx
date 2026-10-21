import { getDb } from '../../../db/client.ts'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { useSync } from '../../../hooks/useSync'
import { dateService } from '../../../services/dateService'
import { syncService } from '../../../services/syncService'
import { useSyncStore } from '../../../stores/useSyncStore'
import { SyncIconButton } from '../SyncIconButton'
import type { SyncButtonProps } from '../types.ts'

/**
 * The signed-in user's Sync button: backs up and syncs every group, or only
 * `group`, asking Google for Drive access the first time. Its tip says when
 * the last sync (of everything, or of that group) finished on this device.
 */
export function DriveSyncButton({ group, onBand }: SyncButtonProps) {
  const { sync, syncGroup, running } = useSync()
  const dataVersion = useSyncStore((state) => state.dataVersion)
  const { state } = useAsyncData(
    async () => {
      const db = await getDb()
      return group ? syncService.lastGroupSyncAt(db, group.id) : syncService.lastSyncedAt(db)
    },
    `${group?.id ?? 'all'}:${dataVersion}`,
    { keepPrevious: true },
  )

  const lastSyncedAt = state.status === 'ready' ? state.data : null
  let tip = group ? 'Sync this group' : 'Sync and back up'
  if (lastSyncedAt) tip = `Last synced ${dateService.formatTimeAgo(lastSyncedAt, new Date(), navigator.language)}`

  return (
    <SyncIconButton
      tip={tip}
      spinning={running}
      onBand={onBand}
      onClick={() => (group ? syncGroup(group.id, group.name) : sync())}
    />
  )
}
