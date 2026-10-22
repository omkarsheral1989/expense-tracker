// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { photoService } from '../../../services/photoService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { renderPage } from '../../../testing/render.tsx'
import { PersonAvatar } from '../index.tsx'

const ADDRESS = 'https://lh3.googleusercontent.com/a/priya'
const KEY = `person-picture:${ADDRESS}`
const profile = { id: 'avatar-dataset', email: 'omkar@gmail.com', name: 'Omkar' }

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
const respondWith = (blob: Blob, ok = true) => vi.fn(async () => ({ ok, blob: async () => blob }) as Response)

function renderAvatar(picture?: string | null, count = 1) {
  return renderPage(
    <>
      {Array.from({ length: count }, (_, index) => (
        <PersonAvatar key={index} name="priya shah" picture={picture} />
      ))}
    </>,
  )
}

/** What the avatars show: their pictures' addresses. */
const shown = () => [...document.querySelectorAll('img')].map((image) => image.getAttribute('src'))

beforeEach(() => {
  useAuthStore.setState({ profile, guest: false, token: null })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await photoService.open(profile.id).deletePhoto(KEY)
})

describe('PersonAvatar', () => {
  it('shows the first letter of the name, capitalized, when there is no picture', () => {
    renderAvatar(undefined)

    expect(screen.getByText('P')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the picture at its address, without a referrer, as Google requires', async () => {
    const fetching = vi.fn(async () => Promise.reject(new Error('offline')))
    vi.stubGlobal('fetch', fetching)
    renderAvatar(ADDRESS)
    // Let the attempt to download run its course before the test ends.
    await waitFor(() => expect(fetching).toHaveBeenCalled())

    const image = document.querySelector('img')!
    expect(image).toHaveAttribute('src', ADDRESS)
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('falls back to the letter when the picture cannot be loaded', async () => {
    const fetching = vi.fn(async () => Promise.reject(new Error('offline')))
    vi.stubGlobal('fetch', fetching)
    renderAvatar(ADDRESS)
    await waitFor(() => expect(fetching).toHaveBeenCalled())

    fireEvent.error(document.querySelector('img')!)

    await waitFor(() => expect(document.querySelector('img')).toBeNull())
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('keeps its own copy of the picture the first time it is online, and shows that copy', async () => {
    const fetching = respondWith(png())
    vi.stubGlobal('fetch', fetching)

    renderAvatar(ADDRESS)

    await waitFor(() => expect(shown()[0]).toMatch(/^blob:/))
    expect(fetching).toHaveBeenCalledWith(ADDRESS, { referrerPolicy: 'no-referrer' })
    expect(await photoService.open(profile.id).getThumbnail(KEY)).not.toBeNull()
  })

  it('shows the copy it has without downloading again, and offline', async () => {
    await photoService.open(profile.id).savePhoto(KEY, png(), png())
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const fetching = respondWith(png())
    vi.stubGlobal('fetch', fetching)

    renderAvatar(ADDRESS)

    await waitFor(() => expect(shown()[0]).toMatch(/^blob:/))
    expect(fetching).not.toHaveBeenCalled()
  })

  it('does not try to download while offline, and uses the address', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const fetching = respondWith(png())
    vi.stubGlobal('fetch', fetching)

    renderAvatar(ADDRESS)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetching).not.toHaveBeenCalled()
    expect(shown()).toEqual([ADDRESS])
  })

  it('keeps using the address when Google refuses the download or sends something that is not a picture', async () => {
    for (const response of [respondWith(png(), false), respondWith(new Blob(['<html>'], { type: 'text/html' }))]) {
      vi.stubGlobal('fetch', response)
      const view = renderAvatar(ADDRESS)

      await waitFor(() => expect(response).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(shown()).toEqual([ADDRESS])
      expect(await photoService.open(profile.id).getThumbnail(KEY)).toBeNull()
      view.unmount()
    }
  })

  it('downloads a picture once however many avatars show it', async () => {
    const fetching = respondWith(png())
    vi.stubGlobal('fetch', fetching)

    renderAvatar(ADDRESS, 3)

    await waitFor(() => expect(shown()).toHaveLength(3))
    await waitFor(() => expect(shown().every((source) => source?.startsWith('blob:'))).toBe(true))
    expect(fetching).toHaveBeenCalledTimes(1)
  })

  it('works without a signed-in user: it just shows the address', () => {
    useAuthStore.setState({ profile: null, guest: false })
    renderAvatar(ADDRESS)

    expect(shown()).toEqual([ADDRESS])
  })
})
