import { App } from 'antd'
import { getDb } from '../../db/client.ts'
import { deviceService } from '../../services/deviceService'
import { DriveAuthError, DriveError, driveService } from '../../services/driveService'
import type { DriveClient } from '../../services/driveService/types.ts'
import { groupService } from '../../services/groupService'
import { photoService } from '../../services/photoService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import { useCurrentUser } from '../useCurrentUser'
import { DriveTokenError, useDriveToken } from '../useDriveToken'
import type { Database } from '../../db/client.ts'
import {
  DRIVE_TOKEN_MESSAGES,
  EXPIRED_MESSAGE,
  GROUP_FAILED_MESSAGE,
  GROUP_OUT_OF_SPACE_MESSAGE,
  GROUP_PHOTO_DETAILS,
  SHARED_FAILED_MESSAGE,
  GROUP_STEP_DETAILS,
  OFFLINE_MESSAGE,
  OUT_OF_SPACE_MESSAGE,
  photoCount,
} from './constants.ts'
import { joinNames } from './utils.ts'

const BACKUP_STEP = 'backup'
const SHARED_STEP = 'shared'

/** Stops a run once Drive access has run out: the line that met it says so, and nothing more starts. */
class AccessExpired extends Error {}

/**
 * Starts a sync, a single group's sync or a restore from Drive, showing its
 * progress in the sync dialog (ADR-044). Each must be called from a click,
 * since Drive access may need Google's window. Pressing again while one runs
 * only opens the dialog.
 */
export function useSync() {
  const user = useCurrentUser()
  const { message } = App.useApp()
  const { getDriveToken, forgetDriveToken } = useDriveToken()
  const running = useSyncStore((state) => state.running)
  const { start, updateStep, addStep, finish, openDialog } = useSyncStore.getState()

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

  /** Drive's own reason for a failure (its status and Google's message), or the error's message. */
  function reasonOf(error: unknown) {
    if (error instanceof DriveError) return error.reason
    return error instanceof Error ? error.message : String(error)
  }

  /** What a failed step says: Drive access ran out, or the given failure. */
  function failure(error: unknown, otherwise: string) {
    if (error instanceof DriveAuthError) {
      forgetDriveToken()
      return EXPIRED_MESSAGE
    }
    return otherwise
  }

  /** The backup line: the data, then the photos. Throws `AccessExpired` to stop the run. */
  async function backUp(db: Database, drive: DriveClient, userId: string, datasetId: string) {
    try {
      await syncService.backUp(db, drive, userId)
      const { failures } = await syncService.backUpPhotos(db, drive, photoService.open(datasetId), ({ done, total }) =>
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
      updateStep(BACKUP_STEP, { status: 'error', detail: failure(error, "Couldn't back up. Press Sync to try again.") })
      if (error instanceof DriveAuthError) throw new AccessExpired()
    }
  }

  /**
   * One group's line, from "Getting changes…" to its outcome. Returns the
   * user's person id, which a merge may have changed; throws `AccessExpired`
   * to stop the run.
   */
  async function syncGroupLine(db: Database, drive: DriveClient, userId: string, groupId: string, label: string) {
    const key = `group:${groupId}`
    addStep({ key, label, status: 'running', detail: GROUP_STEP_DETAILS.receiving })
    try {
      const result = await syncService.syncGroup(db, drive, userId, groupId, (step) =>
        updateStep(key, { detail: GROUP_STEP_DETAILS[step] }),
      )
      if (result.status === 'waiting') {
        updateStep(key, { status: 'waiting', detail: `Waiting for ${result.creatorName} to sync this group first.` })
        return userId
      }
      const me = followRename(userId, result.renamed)
      const photos = await syncService.syncGroupPhotos(db, drive, me, groupId, photoService.open(user!.datasetId), (direction, { done, total }) =>
        updateStep(key, { detail: `${GROUP_PHOTO_DETAILS[direction]} ${done} of ${total}` }),
      )

      // Problems first, each in a sentence of its own; otherwise what was done.
      const problems: string[] = []
      if (result.unreadable.length) problems.push(`${joinNames(result.unreadable.map((name) => `${name}'s`))} changes couldn't be read.`)
      if (photos.outOfSpace) problems.push(GROUP_OUT_OF_SPACE_MESSAGE)
      else if (photos.failures) problems.push(`${photoCount(photos.failures)} couldn't be synced. Press Sync to try again.`)
      if (problems.length) {
        updateStep(key, { status: 'error', detail: problems.join(' ') })
      } else {
        const detail = result.sharedWith.length ? `Shared with ${joinNames(result.sharedWith)}` : GROUP_STEP_DETAILS.synced
        updateStep(key, { status: 'done', detail })
      }
      return me
    } catch (error) {
      updateStep(key, { status: 'error', detail: failure(error, `${GROUP_FAILED_MESSAGE} ${reasonOf(error)}`) })
      if (error instanceof DriveAuthError) throw new AccessExpired()
      return userId
    }
  }

  /**
   * The groups shared with the user that the device did not have, now merged
   * in, and the user's person id after that merge. A failure gets a line of its
   * own; throws `AccessExpired` to stop the run.
   */
  async function findSharedGroups(db: Database, drive: DriveClient, userId: string, email: string) {
    try {
      const { found, renamed } = await syncService.findSharedGroups(db, drive, email)
      return { found, userId: followRename(userId, renamed) }
    } catch (error) {
      addStep({
        key: SHARED_STEP,
        label: 'Groups shared with you',
        status: 'error',
        detail: failure(error, `${SHARED_FAILED_MESSAGE} ${reasonOf(error)}`),
      })
      if (error instanceof DriveAuthError) throw new AccessExpired()
      return { found: [], userId }
    }
  }

  /** The user's person id after a merge, remembered on the device when it changed. */
  function followRename(userId: string, renamed: ReadonlyMap<string, string>) {
    const renamedTo = renamed.get(userId)
    if (!renamedTo) return userId
    deviceService.setUserPersonId(renamedTo)
    return renamedTo
  }

  /** Backs up, then syncs every group (in the home page's order), then brings in groups shared with the user. */
  async function sync() {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    start('Syncing', [{ key: BACKUP_STEP, label: 'Backup', status: 'running', detail: 'Saving your data…' }])
    try {
      const db = await getDb()
      const drive = driveService.client(token)
      let userId = user.personId
      await backUp(db, drive, userId, user.datasetId)
      for (const group of await groupService.listGroups(db, userId)) {
        userId = await syncGroupLine(db, drive, userId, group.id, group.name)
      }
      if (user.email) {
        const shared = await findSharedGroups(db, drive, userId, user.email)
        userId = shared.userId
        for (const group of shared.found) {
          userId = await syncGroupLine(db, drive, userId, group.groupId, `New group: ${group.name}`)
        }
      }
    } catch (error) {
      if (!(error instanceof AccessExpired)) throw error
    } finally {
      finish()
    }
  }

  /** Syncs one group only, without the backup (the group page's button). */
  async function syncGroup(groupId: string, name: string) {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    start('Syncing', [])
    try {
      await syncGroupLine(await getDb(), driveService.client(token), user.personId, groupId, name)
    } catch (error) {
      if (!(error instanceof AccessExpired)) throw error
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

  return { sync, syncGroup, restore, running }
}
