/**
 * Where receipt photos are kept on the device: the original at full size and
 * a small thumbnail for lists, both under the id of the photo's row in the
 * database. Only metadata goes in the database (CLAUDE.md, ADR-006).
 */
export type PhotoStore = {
  /** Keeps a photo and its thumbnail, replacing any already kept under `id`. */
  savePhoto(id: string, photo: Blob, thumbnail: Blob): Promise<void>
  /** The original photo, or null when it is not on this device. */
  getPhoto(id: string): Promise<Blob | null>
  /** The thumbnail, or null when it is not on this device. */
  getThumbnail(id: string): Promise<Blob | null>
  /** Removes the photo and its thumbnail; nothing happens when there is none. */
  deletePhoto(id: string): Promise<void>
}

/** A photo as it is described in the database. */
export type ReceiptInput = {
  id: string
  /** Such as 'image/jpeg'. */
  mimeType: string
  sizeBytes: number
}
