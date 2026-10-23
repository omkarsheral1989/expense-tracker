import { openDB } from 'idb'

const DATABASE_NAME = 'ownledger-shared'
const STORE_NAME = 'shares'
const KEY = 'latest'

/** A share older than this is ignored and removed (PRD 5.11). */
export const SHARE_MAX_AGE_MS = 60 * 60 * 1000

/** One picture from another app's share sheet, kept as bytes (older Safari cannot store Blobs). */
export type SharedPicture = {
  name: string
  type: string
  bytes: ArrayBuffer
}

/** What another app shared with OwnLedger, held until the landing page has taken it. */
export type SharedItems = {
  pictures: SharedPicture[]
  /** The shared title, text and link, each once, one per line; empty when none came. */
  notes: string
  /** How many pictures beyond the limit were left out. */
  leftOut: number
  /** When it was shared (milliseconds since 1970). */
  sharedAt: number
}

function open() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME)
    },
  })
}

/**
 * The one held share. It is used by the service worker (which saves it) and by
 * the page (which takes it), through IndexedDB, since they run apart. Only the
 * latest share is kept.
 */
export const sharedFiles = {
  async save(items: SharedItems): Promise<void> {
    const db = await open()
    try {
      await db.put(STORE_NAME, items, KEY)
    } finally {
      db.close()
    }
  },

  /** The held share, or null when there is none or it is too old (then it is removed). */
  async read(now = Date.now()): Promise<SharedItems | null> {
    const db = await open()
    try {
      const items = (await db.get(STORE_NAME, KEY)) as SharedItems | undefined
      if (!items) return null
      if (now - items.sharedAt > SHARE_MAX_AGE_MS) {
        await db.delete(STORE_NAME, KEY)
        return null
      }
      return items
    } finally {
      db.close()
    }
  },

  async clear(): Promise<void> {
    const db = await open()
    try {
      await db.delete(STORE_NAME, KEY)
    } finally {
      db.close()
    }
  },
}
