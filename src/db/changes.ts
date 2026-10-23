/**
 * Tells the rest of the app that the device's data changed, so screens that
 * remember what they read (`useCachedData`, ADR-051) know it is out of date.
 * The database has no change events of its own, so the services that write
 * announce it through `notifyAfter`, and a finished sync does through `announce`.
 */
const listeners = new Set<() => void>()

export const dataChanges = {
  /** Calls `listener` after every change; returns the function that stops it. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },

  /** Says the data changed. */
  announce() {
    listeners.forEach((listener) => listener())
  },
}

/**
 * Wraps the listed functions of a service so that each call announces a change
 * once it is done, unless it came back refused or nothing changed. Refusals and
 * failures change nothing, so they announce nothing.
 */
export function notifyAfter<T extends object>(service: T, names: (keyof T)[]): T {
  const wrapped = { ...service } as Record<string, unknown>
  for (const name of names as string[]) {
    const original = (service as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]
    wrapped[name] = async (...args: unknown[]) => {
      const result = await original(...args)
      const refused = typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false
      if (!refused) dataChanges.announce()
      return result
    }
  }
  return wrapped as T
}
