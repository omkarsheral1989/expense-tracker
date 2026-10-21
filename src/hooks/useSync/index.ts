import { App } from 'antd'
import { getDb } from '../../db/client.ts'
import { deviceService } from '../../services/deviceService'
import { DriveAuthError, driveService } from '../../services/driveService'
import { photoService } from '../../services/photoService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import { useCurrentUser } from '../useCurrentUser'
import { DriveTokenError, useDriveToken } from '../useDriveToken'
import { DRIVE_TOKEN_MESSAGES, EXPIRED_MESSAGE, OFFLINE_MESSAGE, OUT_OF_SPACE_MESSAGE, photoCount } from './constants.ts'

const BACKUP_STEP = 'backup'

/**
 * Starts a sync (for now: the backup) or a restore from Drive, showing its
 * progress in the sync dialog (ADR-044). Both must be called from a click,
 * since Drive access may need Google's window. Pressing again while one runs
 * only opens the dialog.
 */
export function useSync() {
  const user = useCurrentUser()
  const { message } = App.useApp()
  const { getDriveToken, forgetDriveToken } = useDriveToken()
  const running = useSyncStore((state) => state.running)
  const { start, updateStep, finish, openDialog } = useSyncStore.getState()

  /** Drive access, or null after telling the user why there is none. Call in the click. */
  function driveAccess(): Promise<string | null> | null {
    if (running) {
      openDialog()
      return null
    }
    if (!navigator.onLine) {
      message.warning(OFFLINE_MESSAGE)
      return null
    }
    return getDriveToken().catch((error: unknown) => {
      if (error instanceof DriveTokenError) message.error(DRIVE_TOKEN_MESSAGES[error.problem])
      else message.error(DRIVE_TOKEN_MESSAGES.unavailable)
      return null
    })
  }

  /** What a failed step says: Drive access ran out, or the given failure. */
  function failure(error: unknown, otherwise: string) {
    if (error instanceof DriveAuthError) {
      forgetDriveToken()
      return EXPIRED_MESSAGE
    }
    return otherwise
  }

  async function sync() {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    start('Syncing', [{ key: BACKUP_STEP, label: 'Backup', status: 'running', detail: 'Saving your data…' }])
    try {
      const db = await getDb()
      const drive = driveService.client(token)
      await syncService.backUp(db, drive, user.personId)
      const { failures } = await syncService.backUpPhotos(db, drive, photoService.open(user.datasetId), ({ done, total }) =>
        updateStep(BACKUP_STEP, { detail: `Backing up photos… ${done} of ${total}` }),
      )
      if (failures) {
        updateStep(BACKUP_STEP, {
          status: 'error',
          detail: `${photoCount(failures)} couldn't be backed up. Press Sync to try again.`,
        })
      } else {
        updateStep(BACKUP_STEP, { status: 'done', detail: 'Backed up' })
      }
    } catch (error) {
      updateStep(BACKUP_STEP, {
        status: 'error',
        detail: failure(error, "Couldn't back up. Press Sync to try again."),
      })
    } finally {
      finish()
    }
  }

  async function restore() {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    start('Restoring', [{ key: BACKUP_STEP, label: 'Backup', status: 'running', detail: 'Restoring your data…' }])
    try {
      const db = await getDb()
      const drive = driveService.client(token)
      const result = await syncService.restore(db, drive)
      if (result.ok) {
        // The user's own person may now have the id it has in the backup.
        const renamedTo = result.renamed.get(user.personId)
        if (renamedTo) deviceService.setUserPersonId(renamedTo)
        const photos = await syncService.restorePhotos(db, drive, photoService.open(user.datasetId), ({ done, total }) =>
          updateStep(BACKUP_STEP, { detail: `Downloading photos… ${done} of ${total}` }),
        )
        if (photos.outOfSpace) {
          updateStep(BACKUP_STEP, { status: 'error', detail: OUT_OF_SPACE_MESSAGE })
        } else if (photos.failures) {
          updateStep(BACKUP_STEP, {
            status: 'error',
            detail: `${photoCount(photos.failures)} couldn't be restored. Restore from Drive again to try again.`,
          })
        } else {
          updateStep(BACKUP_STEP, { status: 'done', detail: 'Restored' })
        }
        message.success('Backup restored.')
      } else {
        updateStep(BACKUP_STEP, {
          status: 'error',
          detail:
            result.reason === 'none'
              ? 'No backup found in your Drive.'
              : "The backup in your Drive couldn't be read.",
        })
      }
    } catch (error) {
      updateStep(BACKUP_STEP, {
        status: 'error',
        detail: failure(error, "Couldn't restore the backup. Please try again."),
      })
    } finally {
      finish()
    }
  }

  return { sync, restore, running }
}
