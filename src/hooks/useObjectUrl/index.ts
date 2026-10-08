import { useCallback, useSyncExternalStore } from 'react'

/** One address per Blob, shared by every component showing it, with how many show it now. */
const addresses = new WeakMap<Blob, { url: string; users: number }>()

function addressOf(blob: Blob) {
  let address = addresses.get(blob)
  if (!address) {
    address = { url: URL.createObjectURL(blob), users: 0 }
    addresses.set(blob, address)
  }
  return address
}

/**
 * An address (`blob:…`) that shows a Blob, such as a photo, in an `<img>`.
 * The address is freed once no component shows that Blob any more, so photos
 * do not stay in memory. Null for no Blob.
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const subscribe = useCallback(() => {
    if (!blob) return () => {}
    const address = addressOf(blob)
    address.users++
    return () => {
      address.users--
      // Freed a moment later, so a component that is shown again at once
      // (React does this in development) keeps the same address.
      queueMicrotask(() => {
        if (address.users > 0 || addresses.get(blob) !== address) return
        addresses.delete(blob)
        URL.revokeObjectURL(address.url)
      })
    }
  }, [blob])

  return useSyncExternalStore(subscribe, () => (blob ? addressOf(blob).url : null))
}
