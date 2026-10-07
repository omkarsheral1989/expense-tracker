export type DatabaseLock = {
  /** Lets another tab take the lock. */
  release: () => void
}

/**
 * Takes the lock that lets one tab use an account's database. The browser
 * drops it by itself when the tab closes, so a crashed tab never keeps the
 * database locked.
 *
 * Resolves to `null` when another tab already holds it. In a browser without
 * the Web Locks API there is nothing to take, so it resolves to a lock that
 * does nothing.
 */
export function acquireDatabaseLock(
  accountId: string,
): Promise<DatabaseLock | null> {
  if (!('locks' in navigator)) return Promise.resolve({ release: () => {} })

  return new Promise((resolve) => {
    navigator.locks.request(
      `ownledger-database-${accountId}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          resolve(null)
          return
        }
        // The browser keeps the lock until the promise returned here settles,
        // which happens when `release` is called.
        return new Promise<void>((release) => resolve({ release }))
      },
    )
  })
}
