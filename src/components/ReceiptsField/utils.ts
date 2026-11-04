/**
 * The pictures on the clipboard of a paste event (image data, or image files copied in Finder).
 * Empty when there are none, or when the paste is going into a text field and the clipboard also holds text:
 * then the text should paste as usual.
 */
export function pastedPictures(event: ClipboardEvent): File[] {
  const data = event.clipboardData
  if (!data) return []
  const pictures = [...data.files].filter((file) => file.type.startsWith('image/'))
  const target = event.target
  const inField =
    target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  if (inField && data.getData('text/plain') !== '') return []
  return pictures
}
