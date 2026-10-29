import { Flex, Image, Skeleton } from 'antd'
import { useStoredPhotos } from '../../hooks/useStoredPhotos'
import { photoService } from '../../services/photoService'
import { RADIUS } from '../../theme/radius.ts'
import { ReceiptThumbnail, THUMBNAIL_SIZE } from './ReceiptThumbnail'

type Props = {
  /** The expense's photos, in order. */
  receipts: { id: string }[]
  /** Names the device's photo store, which holds them. */
  datasetId: string
}

/**
 * The expense's receipt photos as a row of thumbnails; tapping one shows them at full size, in the order of the row.
 * All the photos are read first and the thumbnails appear together, because the viewer orders its photos by when
 * each thumbnail first appears (`useStoredPhotos`).
 */
export function ReceiptGallery({ receipts, datasetId }: Props) {
  const store = photoService.open(datasetId)
  const photos = useStoredPhotos(store, receipts.map((receipt) => receipt.id))

  function renderThumbnail(receipt: { id: string }, index: number) {
    const photo = photos?.find((one) => one.id === receipt.id)
    return (
      <div key={receipt.id} role="listitem">
        {photo ? (
          <ReceiptThumbnail thumbnail={photo.thumbnail} photo={photo.photo} number={index + 1} />
        ) : (
          <Skeleton.Image active style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: RADIUS.inner }} />
        )}
      </div>
    )
  }

  return (
    <Image.PreviewGroup>
      <Flex wrap gap={12} role="list" aria-label="Receipt photos">
        {receipts.map(renderThumbnail)}
      </Flex>
    </Image.PreviewGroup>
  )
}
