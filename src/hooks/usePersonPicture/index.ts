import { useEffect, useState } from 'react'
import { photoService } from '../../services/photoService'
import { useCurrentUser } from '../useCurrentUser'
import { useObjectUrl } from '../useObjectUrl'

/** Pictures of people are kept in the photo store under this prefix and their address (ADR-046). */
const KEY_PREFIX = 'person-picture:'

// One download per address at a time, however many avatars show it.
const downloads = new Map<string, Promise<Blob | null>>()

async function pictureOf(datasetId: string, address: string): Promise<Blob | null> {
  const store = photoService.open(datasetId)
  const key = KEY_PREFIX + address
  const kept = await store.getThumbnail(key)
  if (kept) return kept
  if (!navigator.onLine) return null

  let download = downloads.get(address)
  if (!download) {
    download = (async () => {
      // Google pictures only load without a referrer.
      const response = await fetch(address, { referrerPolicy: 'no-referrer' })
      if (!response.ok) return null
      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) return null
      await store.savePhoto(key, blob, blob)
      return blob
    })().finally(() => downloads.delete(address))
    downloads.set(address, download)
  }
  return download
}

/**
 * Where to load a person's Google picture from: this device's own copy once it
 * has one (so it shows offline), made the first time it is seen online, and
 * until then, or when a copy cannot be made, the address itself. Undefined when
 * the person has no picture.
 */
export function usePersonPicture(address: string | null | undefined): string | undefined {
  const user = useCurrentUser()
  const datasetId = user?.datasetId
  const [copy, setCopy] = useState<{ address: string; blob: Blob } | null>(null)

  useEffect(() => {
    if (!address || !datasetId) return
    let cancelled = false
    pictureOf(datasetId, address)
      .then((blob) => {
        if (blob && !cancelled) setCopy({ address, blob })
      })
      // No copy can be made (offline, or Google refuses): the address is used as it is.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [address, datasetId])

  const copyUrl = useObjectUrl(copy && copy.address === address ? copy.blob : null)
  return copyUrl ?? address ?? undefined
}
