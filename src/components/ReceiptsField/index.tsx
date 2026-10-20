import { CameraOutlined } from '@ant-design/icons'
import { App, Button, Flex, Tooltip } from 'antd'
import { useRef, type ChangeEvent } from 'react'
import { MAX_RECEIPTS_PER_EXPENSE } from '../../db/constants.ts'
import type { PhotoStore, ReceiptInput } from '../../services/photoService/types.ts'
import { ReceiptPreview } from './ReceiptPreview'
import { StoredReceiptPreview } from './StoredReceiptPreview'

type Props = {
  /** Given by the form item, so that its messages are tied to the button. */
  id?: string
  /** The photos chosen so far, in order. */
  value?: File[]
  onChange?: (files: File[]) => void
  /**
   * Photos the expense already has (when editing), shown before the chosen
   * ones and counted with them towards the limit. Leave out for a new expense.
   */
  stored?: ReceiptInput[]
  /** Called with the remaining stored photos when the user takes one off. */
  onStoredChange?: (stored: ReceiptInput[]) => void
  /** Where the stored photos' thumbnails are read from; needed with `stored`. */
  photoStore?: PhotoStore
}

/**
 * Receipt photos for the expense: a camera button that opens the device's own
 * file chooser (which offers the camera on phones), then the chosen photos as
 * small squares, each with an x. Up to 10; files that are not pictures are
 * ignored. Works as an Ant Design form field.
 */
export function ReceiptsField({ id, value = [], onChange, stored = [], onStoredChange, photoStore }: Props) {
  const { message } = App.useApp()
  const chooser = useRef<HTMLInputElement>(null)
  const count = stored.length + value.length
  const full = count >= MAX_RECEIPTS_PER_EXPENSE

  function handleChosen(event: ChangeEvent<HTMLInputElement>) {
    const pictures = [...(event.target.files ?? [])].filter((file) => file.type.startsWith('image/'))
    // Cleared, so choosing the same file again is noticed.
    event.target.value = ''
    const room = MAX_RECEIPTS_PER_EXPENSE - count
    if (pictures.length > room) {
      message.warning(`An expense can have up to ${MAX_RECEIPTS_PER_EXPENSE} photos.`)
    }
    if (pictures.length > 0 && room > 0) onChange?.([...value, ...pictures.slice(0, room)])
  }

  function renderStored(photo: ReceiptInput, index: number) {
    if (!photoStore) return null
    return (
      <StoredReceiptPreview
        key={photo.id}
        photoId={photo.id}
        store={photoStore}
        number={index + 1}
        onRemove={() => onStoredChange?.(stored.filter((other) => other.id !== photo.id))}
      />
    )
  }

  function renderPreview(file: File, index: number) {
    return (
      <ReceiptPreview
        key={`${index}-${file.name}-${file.size}`}
        file={file}
        number={stored.length + index + 1}
        onRemove={() => onChange?.(value.filter((_, other) => other !== index))}
      />
    )
  }

  const button = (
    <Button
      id={id}
      size="large"
      icon={<CameraOutlined />}
      aria-label="Add receipt photos"
      disabled={full}
      onClick={() => chooser.current?.click()}
      style={{ width: 64, height: 64 }}
    />
  )

  return (
    <Flex wrap gap={12} align="center">
      {full ? (
        <Tooltip title={`Up to ${MAX_RECEIPTS_PER_EXPENSE} photos.`}>
          <span style={{ display: 'inline-flex' }}>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
      <input
        ref={chooser}
        type="file"
        accept="image/*"
        multiple
        // The `hidden` attribute loses to the input styles of the page, so it is hidden here.
        style={{ display: 'none' }}
        data-testid="receipt-chooser"
        onChange={handleChosen}
      />
      {stored.map(renderStored)}
      {value.map(renderPreview)}
    </Flex>
  )
}
