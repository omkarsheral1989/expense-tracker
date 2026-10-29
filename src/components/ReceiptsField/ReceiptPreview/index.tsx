import { Icon } from '../../Icon'
import { Button, Image } from 'antd'
import { useObjectUrl } from '../../../hooks/useObjectUrl'
import { RADIUS } from '../../../theme/radius.ts'

/** Width and height of a chosen photo's preview, in pixels. */
const PREVIEW_SIZE = 64

type Props = {
  /** The picture to show; null shows an empty square (a stored photo that is not on this device). */
  file: Blob | null
  /** The photo at full size, shown in the viewer when the square is pressed; the square's own picture when left out (a chosen photo is its own full size). */
  full?: Blob | null
  /** Its place among the chosen photos, from 1, for screen readers. */
  number: number
  onRemove: () => void
}

/** A chosen photo as a small square, with an x to take it out again; pressing the photo opens it in the viewer. */
export function ReceiptPreview({ file, full, number, onRemove }: Props) {
  const url = useObjectUrl(file)
  const fullUrl = useObjectUrl(full ?? file)

  return (
    <div style={{ position: 'relative', width: PREVIEW_SIZE, height: PREVIEW_SIZE, flex: 'none' }}>
      {url && (
        <Image
          src={url}
          alt={`Receipt photo ${number}`}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          preview={{ src: fullUrl ?? url }}
          style={{ objectFit: 'cover', borderRadius: RADIUS.inner }}
        />
      )}
      <Button
        size="small"
        shape="circle"
        icon={<Icon name="close" />}
        aria-label={`Remove receipt photo ${number}`}
        onClick={onRemove}
        // A small badge on the corner of the photo, not a control of its own: it
        // keeps a small size, since 40 px would cover most of the photo.
        style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, minWidth: 24, padding: 0 }}
      />
    </div>
  )
}
