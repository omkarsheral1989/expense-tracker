import { getDb } from '../../../db/client.ts'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { useSync } from '../../../hooks/useSync'
import { dateService } from '../../../services/dateService'
import { syncService } from '../../../services/syncService'
import { useSyncStore } from '../../../stores/useSyncStore'
import { SyncIconButton } from '../SyncIconButton'

/**
 * The signed-in user's Sync button: backs up (and later syncs every group),
 * asking Google for Drive access the first time. Its tip says when the last
 * sync finished on this device.
 */
export function DriveSyncButton() {
  const { sync, running } = useSync()
  const dataVersion = useSyncStore((state) => state.dataVersion)
  const { state } = useAsyncData(
    async () => syncService.lastSyncedAt(await getDb()),
    String(dataVersion),
    { keepPrevious: true },
  )

  const lastSyncedAt = state.status === 'ready' ? state.data : null
  const tip = lastSyncedAt
    ? `Last synced ${dateService.formatTimeAgo(lastSyncedAt, new Date(), navigator.language)}`
    : 'Sync and back up'

  return <SyncIconButton tip={tip} spinning={running} onClick={sync} />
}
