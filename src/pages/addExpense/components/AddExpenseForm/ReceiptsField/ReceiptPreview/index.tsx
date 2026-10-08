import { CloseOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useObjectUrl } from '../../../../../../hooks/useObjectUrl'
import { RADIUS } from '../../../../../../theme/radius.ts'

/** Width and height of a chosen photo's preview, in pixels. */
const PREVIEW_SIZE = 64

type Props = {
  file: File
  /** Its place among the chosen photos, from 1, for screen readers. */
  number: number
  onRemove: () => void
}

/** A chosen photo as a small square, with an x to take it out again. */
export function ReceiptPreview({ file, number, onRemove }: Props) {
  const url = useObjectUrl(file)

  return (
    <div style={{ position: 'relative', width: PREVIEW_SIZE, height: PREVIEW_SIZE, flex: 'none' }}>
      {url && (
        <img
          src={url}
          alt={`Receipt photo ${number}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: RADIUS.inner }}
        />
      )}
      <Button
        size="small"
        shape="circle"
        icon={<CloseOutlined />}
        aria-label={`Remove receipt photo ${number}`}
        onClick={onRemove}
        style={{ position: 'absolute', top: -8, right: -8 }}
      />
    </div>
  )
}
