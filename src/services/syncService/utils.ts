import { PHOTO_EXTENSIONS } from './constants.ts'

/** A photo's file name in Drive: its id and an extension for its type ("3f2a….jpg"). */
export function photoFileName(id: string, mimeType: string): string {
  const extension = PHOTO_EXTENSIONS[mimeType] ?? (mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'img')
  return `${id}.${extension}`
}

/**
 * Whether an error means the device's storage is full. IndexedDB reports it as
 * a `DOMException`, which is not an `Error` everywhere, so only its name and
 * message are looked at.
 */
export function isOutOfSpace(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  return name === 'QuotaExceededError' || (typeof message === 'string' && /quota/i.test(message))
}

/**
 * Runs `task` for every item, `limit` at a time. A task that throws stops the
 * run: no new items are started, and the first error is thrown once the tasks
 * already started have ended. Tasks catch the failures they can carry on after.
 */
export async function runPool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failure: { error: unknown } | null = null

  async function worker() {
    while (!failure && next < items.length) {
      const item = items[next++]
      try {
        await task(item)
      } catch (error) {
        failure ??= { error }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failure) throw (failure as { error: unknown }).error
}
