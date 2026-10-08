import { openDB, type IDBPDatabase } from 'idb'
import { PHOTOS_STORE, THUMBNAIL_QUALITY, THUMBNAIL_SIZE, THUMBNAILS_STORE } from './constants.ts'
import type { PhotoStore, ReceiptInput } from './types.ts'

/**
 * What is kept for each picture: its bytes and type rather than the Blob
 * itself, which some browsers (older Safari) cannot store in IndexedDB.
 */
type StoredPicture = { type: string; data: ArrayBuffer }

// Each account's photo database, opened once and reused.
const opened = new Map<string, Promise<IDBPDatabase>>()

function database(accountId: string): Promise<IDBPDatabase> {
  let promise = opened.get(accountId)
  if (!promise) {
    promise = openDB(`ownledger-photos-${accountId}`, 1, {
      upgrade(db) {
        db.createObjectStore(PHOTOS_STORE)
        db.createObjectStore(THUMBNAILS_STORE)
      },
    })
    // If opening fails, forget it so the next call can try again.
    promise.catch(() => opened.delete(accountId))
    opened.set(accountId, promise)
  }
  return promise
}

async function toStored(blob: Blob): Promise<StoredPicture> {
  return { type: blob.type, data: await blob.arrayBuffer() }
}

function fromStored(stored: StoredPicture | undefined): Blob | null {
  return stored ? new Blob([stored.data], { type: stored.type }) : null
}

/**
 * The photo store of one Google account, separate from every other
 * account's (ADR-007). The only way the app reaches receipt photos.
 */
function open(accountId: string): PhotoStore {
  return {
    async savePhoto(id, photo, thumbnail) {
      const [storedPhoto, storedThumbnail] = await Promise.all([toStored(photo), toStored(thumbnail)])
      const db = await database(accountId)
      const tx = db.transaction([PHOTOS_STORE, THUMBNAILS_STORE], 'readwrite')
      await Promise.all([
        tx.objectStore(PHOTOS_STORE).put(storedPhoto, id),
        tx.objectStore(THUMBNAILS_STORE).put(storedThumbnail, id),
        tx.done,
      ])
    },
    async getPhoto(id) {
      return fromStored(await (await database(accountId)).get(PHOTOS_STORE, id))
    },
    async getThumbnail(id) {
      return fromStored(await (await database(accountId)).get(THUMBNAILS_STORE, id))
    },
    async deletePhoto(id) {
      const db = await database(accountId)
      const tx = db.transaction([PHOTOS_STORE, THUMBNAILS_STORE], 'readwrite')
      await Promise.all([
        tx.objectStore(PHOTOS_STORE).delete(id),
        tx.objectStore(THUMBNAILS_STORE).delete(id),
        tx.done,
      ])
    },
  }
}

/**
 * A small JPEG of a photo, at most `THUMBNAIL_SIZE` pixels on its longest
 * side. When the browser cannot read the picture (for example a HEIC photo
 * outside Safari), the photo itself is used.
 */
async function makeThumbnail(photo: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(photo)
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const thumbnail = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY),
    )
    return thumbnail ?? photo
  } catch {
    return photo
  }
}

/**
 * Keeps the chosen photos in the store, each with a thumbnail and a new id,
 * and returns how to describe them in the database, in the same order.
 */
async function storeReceipts(store: PhotoStore, files: readonly File[]): Promise<ReceiptInput[]> {
  const receipts: ReceiptInput[] = []
  for (const file of files) {
    const id = crypto.randomUUID()
    await store.savePhoto(id, file, await makeThumbnail(file))
    receipts.push({ id, mimeType: file.type, sizeBytes: file.size })
  }
  return receipts
}

/** Removes photos kept by `storeReceipts`, for example when saving the expense failed. */
async function removeReceipts(store: PhotoStore, ids: readonly string[]): Promise<void> {
  await Promise.all(ids.map((id) => store.deletePhoto(id)))
}

/** Receipt photos on the device: the per-account store, thumbnails, and saving a form's photos. */
export const photoService = {
  open,
  makeThumbnail,
  storeReceipts,
  removeReceipts,
}
