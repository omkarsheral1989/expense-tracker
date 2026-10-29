import { useAsyncData } from '../../../hooks/useAsyncData'
import type { PhotoStore } from '../../../services/photoService/types.ts'
import { ReceiptPreview } from '../ReceiptPreview'

type Props = {
  /** The photo's id in the photo store. */
  photoId: string
  store: PhotoStore
  /** Its place among the expense's photos, from 1, for screen readers. */
  number: number
  onRemove: () => void
}

/**
 * A photo the expense already has, as a small square with an x, like a chosen
 * one; pressing it opens the photo at full size. Its thumbnail and photo come from the photo store; a photo that is not on this
 * device (for example one another member added, before it is synced) shows an
 * empty square, and can still be taken off.
 */
export function StoredReceiptPreview({ photoId, store, number, onRemove }: Props) {
  const { state } = useAsyncData(async () => ({ thumbnail: await store.getThumbnail(photoId), photo: await store.getPhoto(photoId) }), photoId)
  const ready = state.status === 'ready' ? state.data : null
  return <ReceiptPreview file={ready?.thumbnail ?? null} full={ready?.photo ?? null} number={number} onRemove={onRemove} />
}
