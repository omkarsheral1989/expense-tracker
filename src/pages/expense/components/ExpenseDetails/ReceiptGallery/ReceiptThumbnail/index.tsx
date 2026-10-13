import { PictureOutlined } from '@ant-design/icons'
import { Flex, Image, Skeleton, theme, Typography } from 'antd'
import { useAsyncData } from '../../../../../../hooks/useAsyncData'
import { useObjectUrl } from '../../../../../../hooks/useObjectUrl'
import type { PhotoStore } from '../../../../../../services/photoService/types.ts'
import { RADIUS } from '../../../../../../theme/radius.ts'

const { Text } = Typography

/** Width and height of a thumbnail on the details page, in pixels. */
const THUMBNAIL_SIZE = 88

type Props = {
  photoId: string
  /** Its place among the expense's photos, from 1, for screen readers. */
  number: number
  store: PhotoStore
}

/**
 * One receipt photo as a thumbnail; tapping it shows the photo at full size.
 * A photo that is not on this device (for example one another member added,
 * before it is synced) shows a grey square saying so.
 */
export function ReceiptThumbnail({ photoId, number, store }: Props) {
  const { token } = theme.useToken()
  const { state } = useAsyncData(
    async () => ({ thumbnail: await store.getThumbnail(photoId), photo: await store.getPhoto(photoId) }),
    photoId,
  )
  const thumbnailUrl = useObjectUrl(state.status === 'ready' ? state.data.thumbnail : null)
  const photoUrl = useObjectUrl(state.status === 'ready' ? state.data.photo : null)
  const square = { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: RADIUS.inner }

  if (state.status === 'loading') return <Skeleton.Image active style={square} />

  if (!thumbnailUrl || !photoUrl) {
    return (
      <Flex
        vertical
        align="center"
        justify="center"
        gap={4}
        role="img"
        aria-label={`Receipt photo ${number}, not on this device`}
        style={{ ...square, background: token.colorFillTertiary, padding: 6, textAlign: 'center' }}
      >
        <PictureOutlined style={{ fontSize: 20, color: token.colorTextTertiary }} />
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
          Not on this device
        </Text>
      </Flex>
    )
  }

  return (
    <Image
      src={thumbnailUrl}
      alt={`Receipt photo ${number}`}
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      preview={{ src: photoUrl }}
      style={{ objectFit: 'cover', borderRadius: RADIUS.inner }}
    />
  )
}
