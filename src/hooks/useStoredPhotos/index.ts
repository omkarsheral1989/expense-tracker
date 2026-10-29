import type { PhotoStore } from '../../services/photoService/types.ts'
import { useAsyncData } from '../useAsyncData'

/** One photo of an expense as the photo store has it; both are null for a photo that is not on this device. */
export type StoredPhoto = { id: string; thumbnail: Blob | null; photo: Blob | null }

/**
 * Reads the thumbnails and full-size pictures of several stored photos together, in the order of `ids`, and gives them all at
 * once: null while they are being read. They are read together on purpose: the image viewer orders its photos by when each
 * thumbnail first appears, so thumbnails that appeared one by one, as each finished loading, would be in the wrong order.
 * A photo that cannot be read counts as not on this device. Photos taken out of `ids` disappear at once; `ids` only shrinks
 * (the photos an expense has do not change while it is on screen), so nothing is read again for that.
 */
export function useStoredPhotos(store: PhotoStore | undefined, ids: string[]): StoredPhoto[] | null {
  const { state } = useAsyncData(
    async () => {
      if (!store) return []
      return Promise.all(ids.map(async (id) => ({ id, thumbnail: await store.getThumbnail(id), photo: await store.getPhoto(id) })))
    },
    ids.join('|'),
    { keepPrevious: true },
  )
  if (state.status === 'loading') return null
  if (state.status === 'error') return ids.map((id) => ({ id, thumbnail: null, photo: null }))
  return state.data.filter((photo) => ids.includes(photo.id))
}
