import { App } from 'antd'
import { useRef } from 'react'
import { getDb } from '../../db/client.ts'
import { deviceService } from '../../services/deviceService'
import { DriveError, driveService, stoppingProblem } from '../../services/driveService'
import type { DriveClient } from '../../services/driveService/types.ts'
import { groupService } from '../../services/groupService'
import { logService } from '../../services/logService'
import { photoService } from '../../services/photoService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import { useCurrentUser } from '../useCurrentUser'
import { DriveTokenError, useDriveToken } from '../useDriveToken'
import type { Database } from '../../db/client.ts'
import {
  DRIVE_TOKEN_MESSAGES,
  CONNECTION_MESSAGE,
  STOPPED_MESSAGE,
  DRIVE_FULL_MESSAGE,
  EXPIRED_MESSAGE,
  BACKUP_DETAILS,
  BACKUP_FAILED_MESSAGE,
  GROUP_FAILED_MESSAGE,
  GROUP_PHOTO_DETAILS,
  SHARED_FAILED_MESSAGE,
  GROUP_STEP_DETAILS,
  OFFLINE_MESSAGE,
  OUT_OF_SPACE_MESSAGE,
  photoCount,
} from './constants.ts'
import { joinNames } from './utils.ts'

const log = logService.scope('sync')

const BACKUP_STEP = 'backup'
const SHARED_STEP = 'shared'

/**
 * Stops a run after a failure that would fail everything after it (Drive
 * access ran out, the connection dropped, the Drive is full): the line that
 * met it says so, and nothing more starts.
 */
class RunStopped extends Error {}

/** What getting the backup in Drive left for the Backup line, once the groups have synced. */
type MergedBackup = {
  /** The user's person id after the merge. */
  userId: string
  /** False when merging failed: the backup in Drive is then left as it is, so nothing in it is lost. */
  merged: boolean
  /** Sentences about the backup's photos that could not be downloaded. */
  problems: string[]
}

/**
 * Starts a sync or a single group's sync, showing its progress in the sync
 * dialog (ADR-044). Each must be called from a click,
 * since Drive access may need Google's window. Pressing again while one runs
 * only opens the dialog.
 */
export function useSync() {
  const user = useCurrentUser()
  const { message } = App.useApp()
  const { getDriveToken, forgetDriveToken } = useDriveToken()
  const running = useSyncStore((state) => state.running)
  const { start, updateStep, addStep, finish, openDialog, setResume, setStopRun } = useSyncStore.getState()
  // The run going on, offered again as Continue when Drive access runs out.
  const currentRun = useRef<(() => void) | null>(null)

  /** Drive access, or null after telling the user why there is none. Call in the click. */
  function driveAccess(): Promise<string | null> | null {
    if (running) {
      log.info('Sync pressed while one runs, showing it')
      openDialog()
      return null
    }
    if (!navigator.onLine) {
      log.warn('Sync refused, the device is offline')
      message.warning(OFFLINE_MESSAGE)
      return null
    }
    return getDriveToken().catch((error: unknown) => {
      log.warn('Sync stopped, no Drive access', {
        problem: error instanceof DriveTokenError ? error.problem : 'unknown',
      })
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

  /** What a failed step says: one of the failures that stop a run, or the given failure. */
  function failure(error: unknown, otherwise: string) {
    const stopping = stoppingProblem(error)
    log.error(stopping ? 'Run stopped' : 'Step failed', { problem: stopping ?? 'step', ...logService.errorFields(error) })
    switch (stopping) {
      case 'expired':
        forgetDriveToken()
        setResume(currentRun.current)
        return EXPIRED_MESSAGE
      case 'stopped':
        return STOPPED_MESSAGE
      case 'connection':
        return CONNECTION_MESSAGE
      case 'driveFull':
        return DRIVE_FULL_MESSAGE
      default:
        return otherwise
    }
  }

  /** Throws `RunStopped` after a failure that stops the run. */
  function stopIfNeeded(error: unknown) {
    if (stoppingProblem(error)) throw new RunStopped()
  }

  /**
   * The first part of the Backup line: merges the backup in Drive into the
   * device (so writing it later loses nothing), then downloads its photos the
   * device lacks. No backup, or one that cannot be read, means nothing to
   * merge. Throws `RunStopped` to stop the run.
   */
  async function mergeBackup(db: Database, drive: DriveClient, userId: string, datasetId: string): Promise<MergedBackup> {
    try {
      const result = await syncService.restore(db, drive)
      log.info('Backup in Drive merged', result.ok ? { ok: true } : { ok: false, reason: result.reason })
      const me = result.ok ? followRename(userId, result.renamed) : userId
      const photos = await syncService.restorePhotos(db, drive, photoService.open(datasetId), ({ current, total }) =>
        updateStep(BACKUP_STEP, { detail: `${BACKUP_DETAILS.downloading} ${current} of ${total}` }),
      )
      const problems: string[] = []
      if (photos.outOfSpace) problems.push(OUT_OF_SPACE_MESSAGE)
      else if (photos.failures) problems.push(`${photoCount(photos.failures)} couldn't be downloaded. Press Sync to try again.`)
      log.info('Backup photos downloaded', { failures: photos.failures, outOfSpace: photos.outOfSpace })
      updateStep(BACKUP_STEP, { detail: BACKUP_DETAILS.waiting })
      return { userId: me, merged: true, problems }
    } catch (error) {
      updateStep(BACKUP_STEP, { status: 'error', detail: failure(error, BACKUP_FAILED_MESSAGE) })
      stopIfNeeded(error)
      return { userId, merged: false, problems: [] }
    }
  }

  /** The rest of the Backup line, after the groups: the data, then the photos. Throws `RunStopped` to stop the run. */
  async function backUp(db: Database, drive: DriveClient, userId: string, datasetId: string, problems: string[]) {
    updateStep(BACKUP_STEP, { detail: BACKUP_DETAILS.saving })
    try {
      await syncService.backUp(db, drive, userId)
      log.info('Backup data written')
      const { failures } = await syncService.backUpPhotos(db, drive, photoService.open(datasetId), ({ current, total }) =>
        updateStep(BACKUP_STEP, { detail: `${BACKUP_DETAILS.uploading} ${current} of ${total}` }),
      )
      log.info('Backup photos uploaded', { failures })
      const all = failures ? [...problems, `${photoCount(failures)} couldn't be backed up. Press Sync to try again.`] : problems
      if (all.length) updateStep(BACKUP_STEP, { status: 'error', detail: all.join(' ') })
      else updateStep(BACKUP_STEP, { status: 'done', detail: BACKUP_DETAILS.done })
    } catch (error) {
      updateStep(BACKUP_STEP, { status: 'error', detail: failure(error, BACKUP_FAILED_MESSAGE) })
      stopIfNeeded(error)
    }
  }

  /**
   * One group's line, from "Getting changes…" to its outcome. Returns the
   * user's person id, which a merge may have changed; throws `RunStopped`
   * to stop the run.
   */
  async function syncGroupLine(db: Database, drive: DriveClient, userId: string, groupId: string, label: string) {
    const key = `group:${groupId}`
    addStep({ key, label, status: 'running', detail: GROUP_STEP_DETAILS.receiving })
    try {
      const result = await syncService.syncGroup(db, drive, userId, groupId, (step) =>
        updateStep(key, { detail: GROUP_STEP_DETAILS[step] }),
      )
      log.info('Group data synced', {
        groupId,
        status: result.status,
        ...(result.status === 'waiting' ? {} : { sharedWith: result.sharedWith.length, unreadable: result.unreadable.length }),
      })
      if (result.status === 'waiting') {
        updateStep(key, { status: 'waiting', detail: `Waiting for ${result.creatorName} to sync this group first.` })
        return userId
      }
      const me = followRename(userId, result.renamed)
      const photos = await syncService.syncGroupPhotos(db, drive, me, groupId, photoService.open(user!.datasetId), (direction, { current, total }) =>
        updateStep(key, { detail: `${GROUP_PHOTO_DETAILS[direction]} ${current} of ${total}` }),
      )

      log.info('Group photos synced', { groupId, failures: photos.failures, outOfSpace: photos.outOfSpace })
      // Problems first, each in a sentence of its own; otherwise what was done.
      const problems: string[] = []
      if (result.unreadable.length) problems.push(`${joinNames(result.unreadable.map((name) => `${name}'s`))} changes couldn't be read.`)
      if (photos.outOfSpace) problems.push(OUT_OF_SPACE_MESSAGE)
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
      stopIfNeeded(error)
      return userId
    }
  }

  /**
   * The groups shared with the user that the device did not have, now merged
   * in, and the user's person id after that merge. A failure gets a line of its
   * own; throws `RunStopped` to stop the run.
   */
  async function findSharedGroups(db: Database, drive: DriveClient, userId: string, email: string) {
    try {
      const { found, renamed } = await syncService.findSharedGroups(db, drive, email)
      log.info('Looked for shared groups', { found: found.length })
      return { found, userId: followRename(userId, renamed) }
    } catch (error) {
      addStep({
        key: SHARED_STEP,
        label: 'Groups shared with you',
        status: 'error',
        detail: failure(error, `${SHARED_FAILED_MESSAGE} ${reasonOf(error)}`),
      })
      stopIfNeeded(error)
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

  /**
   * Merges the backup in Drive, syncs every group (in the home page's order),
   * brings in groups the device does not have (shared with the user, or their
   * own), and then writes the backup with all of it.
   */
  async function sync() {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    currentRun.current = sync
    const controller = new AbortController()
    const startedAt = Date.now()
    log.info('Full sync started')
    start('Syncing', [{ key: BACKUP_STEP, label: 'Backup', status: 'running', detail: BACKUP_DETAILS.getting }], { kind: 'all' })
    setStopRun(() => controller.abort())
    // True while the backup's data is merged but not written yet.
    let backupPending = false
    try {
      const db = await getDb()
      const drive = driveService.client(token, { signal: controller.signal })
      const backup = await mergeBackup(db, drive, user.personId, user.datasetId)
      // A backup that could not be merged is not written over (its line already says why).
      backupPending = backup.merged
      let userId = backup.userId
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
      // From here the Backup line says what happened itself.
      backupPending = false
      if (backup.merged) await backUp(db, drive, userId, user.datasetId, backup.problems)
    } catch (error) {
      if (!(error instanceof RunStopped)) throw error
      // A group stopped the run before the backup was written.
      if (backupPending) updateStep(BACKUP_STEP, { status: 'error', detail: BACKUP_DETAILS.stopped })
    } finally {
      log.info('Full sync ended', { ms: Date.now() - startedAt })
      finish()
    }
  }

  /** Syncs one group only, without the backup (the group page's button). */
  async function syncGroup(groupId: string, name: string) {
    const access = driveAccess()
    if (!access || !user) return
    const token = await access
    if (!token) return

    currentRun.current = () => syncGroup(groupId, name)
    const controller = new AbortController()
    log.info('Group sync started', { groupId })
    start('Syncing', [], { kind: 'group', groupId })
    setStopRun(() => controller.abort())
    try {
      await syncGroupLine(await getDb(), driveService.client(token, { signal: controller.signal }), user.personId, groupId, name)
    } catch (error) {
      if (!(error instanceof RunStopped)) throw error
    } finally {
      finish()
    }
  }

  return { sync, syncGroup, running }
}
