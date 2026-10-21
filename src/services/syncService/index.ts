import type { Database } from '../../db/client.ts'
import { expensePhotos } from '../../db/schema.ts'
import { backupService } from '../backupService'
import {
  BACKUP_FILE_NAME,
  BACKUP_FOLDER_NAME,
  BACKUP_PHOTOS_FOLDER_NAME,
  DRIVE_ITEM_KINDS,
  ROOT_FOLDER_NAME,
} from '../driveService/constants.ts'
import type { DriveClient, DriveFile, DriveItemKind } from '../driveService/types.ts'
import type { PhotoStore } from '../photoService/types.ts'
import { groupSync } from './groups.ts'
import { downloadPhotos, photosIn, uploadPhotos } from './photos.ts'
import type { PhotoProgress, PhotosResult, RestoreResult } from './types.ts'

async function findOrCreateFolder(
  drive: DriveClient,
  kind: DriveItemKind,
  name: string,
  parentId?: string,
): Promise<DriveFile> {
  return (await drive.findOwn(kind, parentId)) ?? drive.createFolder(name, kind, parentId)
}

/** Every photo the data knows, removed and deleted ones included (ADR-044). */
function allPhotos(db: Database) {
  return db.select({ id: expensePhotos.id, mimeType: expensePhotos.mimeType }).from(expensePhotos)
}

/** `OwnLedger/Backup`, made the first time. */
async function backupFolder(drive: DriveClient): Promise<DriveFile> {
  const root = await findOrCreateFolder(drive, DRIVE_ITEM_KINDS.root, ROOT_FOLDER_NAME)
  return findOrCreateFolder(drive, DRIVE_ITEM_KINDS.backup, BACKUP_FOLDER_NAME, root.id)
}

/**
 * Backup and sync with the user's Google Drive (ADR-044): the Drive folders,
 * and moving the device's data and photos to and from them. Drive calls go
 * through the `DriveClient` it is given; running out of Drive access is thrown
 * as `DriveAuthError`, and other failures of the data as `DriveError`.
 */
export const syncService = {
  /**
   * Writes everything on the device to `OwnLedger/Backup/backup.json`,
   * creating the folders the first time and replacing the backup after that.
   * The photos follow with `backUpPhotos`.
   */
  async backUp(db: Database, drive: DriveClient, userId: string): Promise<void> {
    const folder = await backupFolder(drive)
    const content = await backupService.exportAll(db, userId)
    const existing = await drive.findOwn(DRIVE_ITEM_KINDS.backupFile, folder.id)
    if (existing) await drive.updateJson(existing.id, content)
    else await drive.createJson(BACKUP_FILE_NAME, DRIVE_ITEM_KINDS.backupFile, folder.id, content)
    await backupService.recordBackup(db, new Date())
  },

  /**
   * Uploads every photo the data names (removed and deleted ones included)
   * that `Backup/photos/` does not have yet; nothing is removed from Drive. A
   * photo that is not on this device is skipped; one that fails is counted and
   * the others carry on.
   */
  async backUpPhotos(
    db: Database,
    drive: DriveClient,
    photos: PhotoStore,
    onProgress: (progress: PhotoProgress) => void = () => {},
  ): Promise<PhotosResult> {
    const folder = await backupFolder(drive)
    const photosFolder = await findOrCreateFolder(drive, DRIVE_ITEM_KINDS.backupPhotos, BACKUP_PHOTOS_FOLDER_NAME, folder.id)
    return uploadPhotos(drive, photos, {
      folderId: photosFolder.id,
      kind: DRIVE_ITEM_KINDS.backupPhoto,
      photos: await allPhotos(db),
      inDrive: await photosIn(drive, photosFolder.id),
      onProgress,
    })
  },

  /** Merges the backup in Drive into the device's data; nothing on the device is removed. The photos follow with `restorePhotos`. */
  async restore(db: Database, drive: DriveClient): Promise<RestoreResult> {
    const root = await drive.findOwn(DRIVE_ITEM_KINDS.root)
    const folder = root && (await drive.findOwn(DRIVE_ITEM_KINDS.backup, root.id))
    const file = folder && (await drive.findOwn(DRIVE_ITEM_KINDS.backupFile, folder.id))
    if (!file) return { ok: false, reason: 'none' }

    const backup = backupService.parse(await drive.download(file.id))
    if (!backup) return { ok: false, reason: 'invalid' }
    return { ok: true, ...(await backupService.importAll(db, backup)) }
  },

  /**
   * Downloads the photos the data names that the device does not have and the
   * backup does, making each one's thumbnail. A photo that fails is counted;
   * the device running out of space stops the downloads.
   */
  async restorePhotos(
    db: Database,
    drive: DriveClient,
    photos: PhotoStore,
    onProgress: (progress: PhotoProgress) => void = () => {},
  ): Promise<PhotosResult> {
    const root = await drive.findOwn(DRIVE_ITEM_KINDS.root)
    const folder = root && (await drive.findOwn(DRIVE_ITEM_KINDS.backup, root.id))
    const photosFolder = folder && (await drive.findOwn(DRIVE_ITEM_KINDS.backupPhotos, folder.id))
    const inDrive = photosFolder ? await photosIn(drive, photosFolder.id) : new Map<string, string>()
    return downloadPhotos(drive, photos, { photos: await allPhotos(db), inDrive, onProgress })
  },

  /** When the last sync (the backup of the data, which every full Sync starts with) finished on this device. */
  lastSyncedAt(db: Database): Promise<Date | null> {
    return backupService.lastBackedUpAt(db)
  },

  ...groupSync,
}
