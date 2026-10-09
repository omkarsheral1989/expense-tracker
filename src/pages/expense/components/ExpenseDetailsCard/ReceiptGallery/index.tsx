import { Flex, Image } from 'antd'
import { photoService } from '../../../../../services/photoService'
import { ReceiptThumbnail } from './ReceiptThumbnail'

type Props = {
  /** The expense's photos, in order. */
  receipts: { id: string }[]
  /** The signed-in user's Google account id, whose photo store holds them. */
  accountId: string
}

/** The expense's receipt photos as a row of thumbnails; tapping one shows them at full size. */
export function ReceiptGallery({ receipts, accountId }: Props) {
  const store = photoService.open(accountId)

  return (
    <Image.PreviewGroup>
      <Flex wrap gap={12} role="list" aria-label="Receipt photos">
        {receipts.map((receipt, index) => (
          <div key={receipt.id} role="listitem">
            <ReceiptThumbnail photoId={receipt.id} number={index + 1} store={store} />
          </div>
        ))}
      </Flex>
    </Image.PreviewGroup>
  )
}
