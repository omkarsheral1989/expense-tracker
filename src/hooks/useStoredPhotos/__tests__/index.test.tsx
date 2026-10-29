// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PhotoStore } from '../../../services/photoService/types.ts'
import { useStoredPhotos } from '../index.ts'

const blob = (text: string) => new Blob([text], { type: 'image/jpeg' })

/** A photo store that holds `ids`, and answers after the delay given for each id. */
function fakeStore(delays: Record<string, number> = {}, missing: string[] = []) {
  const wait = (id: string) => new Promise<void>((resolve) => setTimeout(resolve, delays[id] ?? 0))
  const store: PhotoStore = {
    savePhoto: vi.fn(),
    deletePhoto: vi.fn(),
    getThumbnail: vi.fn(async (id: string) => {
      await wait(id)
      return missing.includes(id) ? null : blob(`thumb-${id}`)
    }),
    getPhoto: vi.fn(async (id: string) => {
      await wait(id)
      return missing.includes(id) ? null : blob(`photo-${id}`)
    }),
  }
  return store
}

describe('useStoredPhotos', () => {
  it('is null while the photos are being read, then gives all of them at once', async () => {
    const store = fakeStore({ a: 40, b: 0 })
    const { result } = renderHook(() => useStoredPhotos(store, ['a', 'b']))

    expect(result.current).toBeNull()
    // b is read at once but a is not: nothing is given until both are.
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.map((photo) => photo.id)).toEqual(['a', 'b'])
  })

  it('gives the photos in the order of the ids, whichever is read first', async () => {
    const store = fakeStore({ a: 30, b: 0, c: 10 })
    const { result } = renderHook(() => useStoredPhotos(store, ['a', 'b', 'c']))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.map((photo) => photo.id)).toEqual(['a', 'b', 'c'])
  })

  it('gives each photo\'s thumbnail and full-size picture', async () => {
    const store = fakeStore()
    const { result } = renderHook(() => useStoredPhotos(store, ['a']))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(await result.current?.[0].thumbnail?.text()).toBe('thumb-a')
    expect(await result.current?.[0].photo?.text()).toBe('photo-a')
  })

  it('has both null for a photo that is not on this device, and the others still there', async () => {
    const store = fakeStore({}, ['b'])
    const { result } = renderHook(() => useStoredPhotos(store, ['a', 'b']))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.[1]).toEqual({ id: 'b', thumbnail: null, photo: null })
    expect(result.current?.[0].photo).not.toBeNull()
  })

  it('counts every photo as not on this device when the store cannot be read', async () => {
    const store = fakeStore()
    vi.mocked(store.getThumbnail).mockRejectedValue(new Error('disk gone'))
    const { result } = renderHook(() => useStoredPhotos(store, ['a', 'b']))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual([
      { id: 'a', thumbnail: null, photo: null },
      { id: 'b', thumbnail: null, photo: null },
    ])
  })

  it('drops a photo that is taken out of the ids at once, without reading the others again', async () => {
    const store = fakeStore()
    const { result, rerender } = renderHook(({ ids }) => useStoredPhotos(store, ids), { initialProps: { ids: ['a', 'b', 'c'] } })
    await waitFor(() => expect(result.current).not.toBeNull())

    rerender({ ids: ['a', 'c'] })

    expect(result.current?.map((photo) => photo.id)).toEqual(['a', 'c'])
  })

  it('has nothing without a store, and reads nothing', async () => {
    const { result } = renderHook(() => useStoredPhotos(undefined, ['a']))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual([])
  })
})
