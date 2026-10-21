import type { Database } from '../../db/client.ts'
import { backupService } from '../backupService'
import {
  BACKUP_FILE_NAME,
  BACKUP_FOLDER_NAME,
  DRIVE_ITEM_KINDS,
  ROOT_FOLDER_NAME,
} from '../driveService/constants.ts'
import type { DriveClient, DriveFile, DriveItemKind } from '../driveService/types.ts'
import type { RestoreResult } from './types.ts'

async function findOrCreateFolder(
  drive: DriveClient,
  kind: DriveItemKind,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  return (await drive.findOwn(kind, parentId)) ?? drive.createFolder(name, kind, parentId)
}

/**
 * Backup and sync with the user's Google Drive (ADR-044): the Drive folders,
 * and moving the device's data to and from them. Drive calls go through the
 * `DriveClient` it is given; failures (Drive access expired, no network) are
 * thrown as `DriveAuthError` or `DriveError`.
 */
export const syncService = {
  /**
   * Writes everything on the device to `OwnLedger/Backup/backup.json`,
   * creating the folders the first time and replacing the backup after that.
   */
  async backUp(db: Database, drive: DriveClient, userId: string): Promise<void> {
    const root = await findOrCreateFolder(drive, DRIVE_ITEM_KINDS.root, ROOT_FOLDER_NAME)
    const folder = await findOrCreateFolder(drive, DRIVE_ITEM_KINDS.backup, BACKUP_FOLDER_NAME, root.id)
    const content = await backupService.exportAll(db, userId)
    const existing = await drive.findOwn(DRIVE_ITEM_KINDS.backupFile, folder.id)
    if (existing) await drive.updateJson(existing.id, content)
    else await drive.createJson(BACKUP_FILE_NAME, DRIVE_ITEM_KINDS.backupFile, folder.id, content)
    await backupService.recordBackup(db, new Date())
  },

  /** Merges the backup in Drive into the device's data; nothing on the device is removed. */
  async restore(db: Database, drive: DriveClient): Promise<RestoreResult> {
    const root = await drive.findOwn(DRIVE_ITEM_KINDS.root)
    const folder = root && (await drive.findOwn(DRIVE_ITEM_KINDS.backup, root.id))
    const file = folder && (await drive.findOwn(DRIVE_ITEM_KINDS.backupFile, folder.id))
    if (!file) return { ok: false, reason: 'none' }

    const backup = backupService.parse(await drive.download(file.id))
    if (!backup) return { ok: false, reason: 'invalid' }
    return { ok: true, ...(await backupService.importAll(db, backup)) }
  },

  /** When the last sync (for now, the backup) finished on this device. */
  lastSyncedAt(db: Database): Promise<Date | null> {
    return backupService.lastBackedUpAt(db)
  },
}
