import { Icon } from '../../Icon'
import { Flex, Image, theme, Typography } from 'antd'
import { useObjectUrl } from '../../../hooks/useObjectUrl'
import { RADIUS } from '../../../theme/radius.ts'

const { Text } = Typography

/** Width and height of a thumbnail on the details page, in pixels. */
export const THUMBNAIL_SIZE = 88

type Props = {
  /** The photo's thumbnail and full-size picture; null when it is not on this device. */
  thumbnail: Blob | null
  photo: Blob | null
  /** Its place among the expense's photos, from 1, for screen readers. */
  number: number
}

/**
 * One receipt photo as a thumbnail; tapping it shows the photo at full size.
 * A photo that is not on this device (for example one another member added,
 * before it is synced) shows a grey square saying so.
 */
export function ReceiptThumbnail({ thumbnail, photo, number }: Props) {
  const { token } = theme.useToken()
  const thumbnailUrl = useObjectUrl(thumbnail)
  const photoUrl = useObjectUrl(photo)
  const square = { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: RADIUS.inner }

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
        <Icon name="picture" style={{ fontSize: 20, color: token.colorTextTertiary }} />
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
