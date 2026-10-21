/** How many photos are uploaded or downloaded at the same time. */
export const PHOTO_TRANSFERS_AT_ONCE = 3

/** File extensions for the picture types phones and cameras produce; others use the end of their type. */
export const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
