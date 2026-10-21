import { DriveAuthError } from '../driveService'
import { PHOTO_ID_PROPERTY } from '../driveService/constants.ts'
import type { DriveClient, DriveItemKind } from '../driveService/types.ts'
import { photoService } from '../photoService'
import type { PhotoStore } from '../photoService/types.ts'
import { PHOTO_TRANSFERS_AT_ONCE } from './constants.ts'
import type { PhotoProgress, PhotosResult } from './types.ts'
import { isOutOfSpace, photoFileName, runPool } from './utils.ts'

/** A photo as the data describes it. */
export type PhotoRow = { id: string; mimeType: string }

/** Thrown inside a photo pool to stop it when the device is full. */
class OutOfSpace extends Error {}

/** The photos in a Drive folder, by photo id: photo id → file id. */
export async function photosIn(drive: DriveClient, folderId: string): Promise<Map<string, string>> {
  const files = await drive.listChildren(folderId)
  return new Map(
    files.flatMap((file) => (file.properties?.[PHOTO_ID_PROPERTY] ? [[file.properties[PHOTO_ID_PROPERTY], file.id]] : [])),
  )
}

/**
 * Uploads to a Drive folder the photos it does not have (`inDrive`), named by
 * id and tagged with `kind`, the photo's id and `properties`, a few at a time.
 * A photo that is not on this device is skipped; one that fails is counted and
 * the others carry on; running out of Drive access stops it.
 */
export async function uploadPhotos(
  drive: DriveClient,
  store: PhotoStore,
  { folderId, kind, photos, inDrive, properties = {}, onProgress = () => {} }: {
    folderId: string
    kind: DriveItemKind
    photos: PhotoRow[]
    inDrive: ReadonlyMap<string, string>
    properties?: Record<string, string>
    onProgress?: (progress: PhotoProgress) => void
  },
): Promise<PhotosResult> {
  const toUpload = photos.filter((photo) => !inDrive.has(photo.id))
  let done = 0
  let failures = 0
  onProgress({ done, total: toUpload.length })
  await runPool(toUpload, PHOTO_TRANSFERS_AT_ONCE, async (photo) => {
    try {
      const picture = await store.getPhoto(photo.id)
      if (picture) {
        await drive.createFile(
          photoFileName(photo.id, photo.mimeType),
          kind,
          folderId,
          new Blob([picture], { type: photo.mimeType }),
          { ...properties, [PHOTO_ID_PROPERTY]: photo.id },
        )
      }
    } catch (error) {
      if (error instanceof DriveAuthError) throw error
      failures++
    }
    onProgress({ done: ++done, total: toUpload.length })
  })
  return { failures, outOfSpace: false }
}

/**
 * Downloads the photos in `inDrive` that the device does not have, giving each
 * its type from the data (Drive's download carries none) and a new thumbnail,
 * a few at a time. A photo that fails is counted; the device running out of
 * space stops the downloads; running out of Drive access stops it too (thrown).
 */
export async function downloadPhotos(
  drive: DriveClient,
  store: PhotoStore,
  { photos, inDrive, onProgress = () => {} }: {
    photos: PhotoRow[]
    inDrive: ReadonlyMap<string, string>
    onProgress?: (progress: PhotoProgress) => void
  },
): Promise<PhotosResult> {
  const toDownload: (PhotoRow & { fileId: string })[] = []
  for (const photo of photos) {
    const fileId = inDrive.get(photo.id)
    // The thumbnail is the smaller of the two to read just to see if the photo is here.
    if (fileId && !(await store.getThumbnail(photo.id))) toDownload.push({ ...photo, fileId })
  }

  let done = 0
  let failures = 0
  let outOfSpace = false
  onProgress({ done, total: toDownload.length })
  try {
    await runPool(toDownload, PHOTO_TRANSFERS_AT_ONCE, async (photo) => {
      try {
        const picture = new Blob([await drive.downloadBlob(photo.fileId)], { type: photo.mimeType })
        await store.savePhoto(photo.id, picture, await photoService.makeThumbnail(picture))
      } catch (error) {
        if (error instanceof DriveAuthError) throw error
        if (isOutOfSpace(error)) throw new OutOfSpace()
        failures++
      }
      onProgress({ done: ++done, total: toDownload.length })
    })
  } catch (error) {
    if (!(error instanceof OutOfSpace)) throw error
    outOfSpace = true
  }
  return { failures, outOfSpace }
}
