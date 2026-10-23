import { sharedFiles, type SharedPicture } from './sharedFiles.ts'

/** The most pictures one expense can have (the same limit as the form, `MAX_RECEIPTS_PER_EXPENSE`). */
const MAX_PICTURES = 10

/** The longest notes an expense can have (`EXPENSE_NOTES_MAX_LENGTH`). */
const MAX_NOTES_LENGTH = 1000

/** The form fields the manifest's `share_target` names (see vite.config.ts). */
export const SHARE_FIELDS = { pictures: 'receipts', title: 'title', text: 'text', url: 'url' } as const

/** The shared title, text and link, each once and in that order, one per line, cut to the notes limit. */
export function notesFrom(parts: { title?: string; text?: string; url?: string }): string {
  const lines: string[] = []
  for (const part of [parts.title, parts.text, parts.url]) {
    const line = part?.trim()
    if (line && !lines.includes(line)) lines.push(line)
  }
  return lines.join('\n').slice(0, MAX_NOTES_LENGTH)
}

function textOf(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Keeps what another app shared (the service worker calls this with the POST
 * the share sheet sent) and gives back where the browser goes next. Anything
 * that is not a picture is ignored, and a request that cannot be read leaves
 * nothing behind; either way the user lands on the share page, which then
 * opens the app normally if there is nothing held.
 */
export async function receiveShare(request: Request, landingUrl: string, now = Date.now()): Promise<Response> {
  try {
    const form = await request.formData()
    const files = form
      .getAll(SHARE_FIELDS.pictures)
      .filter((entry): entry is File => typeof entry !== 'string' && entry.type.startsWith('image/'))
    const kept = files.slice(0, MAX_PICTURES)
    const pictures: SharedPicture[] = await Promise.all(
      kept.map(async (file) => ({ name: file.name, type: file.type, bytes: await file.arrayBuffer() })),
    )
    const notes = notesFrom({
      title: textOf(form, SHARE_FIELDS.title),
      text: textOf(form, SHARE_FIELDS.text),
      url: textOf(form, SHARE_FIELDS.url),
    })
    if (pictures.length > 0 || notes) {
      await sharedFiles.save({ pictures, notes, leftOut: files.length - kept.length, sharedAt: now })
    } else {
      await sharedFiles.clear()
    }
  } catch {
    // Unreadable share: go on to the landing page, which finds nothing.
  }
  // 303: the browser follows a POST with a GET of the landing page.
  return Response.redirect(landingUrl, 303)
}
