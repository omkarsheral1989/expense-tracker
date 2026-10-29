// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { photoService } from '../../../services/photoService'
import type { PhotoStore } from '../../../services/photoService/types.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ReceiptGallery } from '../index.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const blob = (text: string) => new Blob([text], { type: 'image/jpeg' })

/** A store whose photos arrive after the delay given for each id, which `missing` ones never have. */
function useFakeStore(delays: Record<string, number> = {}, missing: string[] = []) {
  const wait = (id: string) => new Promise<void>((resolve) => setTimeout(resolve, delays[id] ?? 0))
  const store: PhotoStore = {
    savePhoto: vi.fn(),
    deletePhoto: vi.fn(),
    getThumbnail: async (id) => (await wait(id), missing.includes(id) ? null : blob(`thumb-${id}`)),
    getPhoto: async (id) => (await wait(id), missing.includes(id) ? null : blob(`photo-${id}`)),
  }
  vi.spyOn(photoService, 'open').mockReturnValue(store)
}

const viewer = () => document.querySelector('.ant-image-preview') as HTMLElement | null
const counter = () => document.querySelector('.ant-image-preview-progress')?.textContent
const previous = () => document.querySelector('.ant-image-preview-switch-prev') as HTMLElement
const next = () => document.querySelector('.ant-image-preview-switch-next') as HTMLElement
const disabled = (button: HTMLElement) => button.className.includes('switch-disabled')

describe('ReceiptGallery (PRD 5.6)', () => {
  it('shows a placeholder for each photo while they are read, then all the thumbnails together', async () => {
    useFakeStore({ a: 30, b: 0 })
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }, { id: 'b' }]} datasetId="d" />)

    const list = screen.getByRole('list', { name: 'Receipt photos' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list.querySelectorAll('.ant-skeleton')).toHaveLength(2)
    // b is read at once, but no thumbnail is shown before a is read too.
    await new Promise((resolve) => setTimeout(resolve, 12))
    expect(within(list).queryByRole('img', { name: 'Receipt photo 2' })).not.toBeInTheDocument()
    expect(await within(list).findByRole('img', { name: 'Receipt photo 1' })).toBeInTheDocument()
    expect(within(list).getByRole('img', { name: 'Receipt photo 2' })).toBeInTheDocument()
  })

  it('opens the viewer on the photo that was pressed, even when a later photo was read first', async () => {
    // The first photo is slower than the second: the viewer used to list them in the order they finished.
    useFakeStore({ a: 30, b: 0 })
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }, { id: 'b' }]} datasetId="d" />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 1' }))

    await waitFor(() => expect(viewer()).not.toBeNull())
    expect(counter()).toBe('1 / 2')
    expect(disabled(previous())).toBe(true)
    expect(disabled(next())).toBe(false)
  })

  it('opens the full-size picture, not the thumbnail', async () => {
    useFakeStore()
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }]} datasetId="d" />)
    const thumbnail = (await screen.findByRole('img', { name: 'Receipt photo 1' })) as HTMLImageElement

    await userEvent.click(thumbnail)

    await waitFor(() => expect(viewer()).not.toBeNull())
    const shown = document.querySelector('.ant-image-preview-img') as HTMLImageElement
    expect(shown.src).toMatch(/^blob:/)
    expect(shown.src).not.toBe(thumbnail.src)
  })

  it('opens on the second photo when that is pressed, with Next switched off', async () => {
    useFakeStore({ a: 30, b: 0 })
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }, { id: 'b' }]} datasetId="d" />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 2' }))

    await waitFor(() => expect(counter()).toBe('2 / 2'))
    expect(disabled(previous())).toBe(false)
    expect(disabled(next())).toBe(true)
  })

  it('steps through the photos in the order of the row', async () => {
    useFakeStore({ a: 40, b: 0, c: 20 })
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]} datasetId="d" />)
    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 1' }))
    await waitFor(() => expect(counter()).toBe('1 / 3'))
    const firstSrc = (document.querySelector('.ant-image-preview-img') as HTMLImageElement).src

    await userEvent.click(next())
    await waitFor(() => expect(counter()).toBe('2 / 3'))
    await userEvent.click(next())

    await waitFor(() => expect(counter()).toBe('3 / 3'))
    expect(disabled(next())).toBe(true)
    expect((document.querySelector('.ant-image-preview-img') as HTMLImageElement).src).not.toBe(firstSrc)
  })

  it('leaves a photo that is not on this device out of the viewer, and says so in its place', async () => {
    useFakeStore({}, ['b'])
    renderPage(<ReceiptGallery receipts={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]} datasetId="d" />)

    expect(await screen.findByRole('img', { name: 'Receipt photo 2, not on this device' })).toHaveTextContent('Not on this device')
    await userEvent.click(screen.getByRole('img', { name: 'Receipt photo 3' }))

    await waitFor(() => expect(counter()).toBe('2 / 2'))
  })
})
