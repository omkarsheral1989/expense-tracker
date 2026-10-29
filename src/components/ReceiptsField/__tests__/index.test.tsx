// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PhotoStore } from '../../../services/photoService/types.ts'
import { renderPage } from '../../../testing/render.tsx'
import { ReceiptsField } from '../index.tsx'

afterEach(cleanup)

const picture = (name: string) => new File([`picture ${name}`], name, { type: 'image/jpeg' })
const blob = (text: string) => new Blob([text], { type: 'image/jpeg' })

function fakeStore(delays: Record<string, number> = {}): PhotoStore {
  const wait = (id: string) => new Promise<void>((resolve) => setTimeout(resolve, delays[id] ?? 0))
  return {
    savePhoto: vi.fn(),
    deletePhoto: vi.fn(),
    getThumbnail: async (id) => (await wait(id), blob(`thumb-${id}`)),
    getPhoto: async (id) => (await wait(id), blob(`photo-${id}`)),
  }
}

const viewer = () => document.querySelector('.ant-image-preview') as HTMLElement | null
const counter = () => document.querySelector('.ant-image-preview-progress')?.textContent
const previous = () => document.querySelector('.ant-image-preview-switch-prev') as HTMLElement
const next = () => document.querySelector('.ant-image-preview-switch-next') as HTMLElement
const disabled = (button: HTMLElement) => button.className.includes('switch-disabled')

describe('the photos of ReceiptsField open in a viewer (PRD 5.5)', () => {
  it('opens a chosen photo at full size when its thumbnail is pressed, with the other photos a step away', async () => {
    renderPage(<ReceiptsField value={[picture('a.jpg'), picture('b.jpg')]} />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 1' }))

    await waitFor(() => expect(viewer()).not.toBeNull())
    expect(counter()).toBe('1 / 2')
    expect(disabled(previous())).toBe(true)
    expect(disabled(next())).toBe(false)
    await userEvent.click(next())
    await waitFor(() => expect(counter()).toBe('2 / 2'))
    expect(disabled(next())).toBe(true)
  })

  it('opens the photo that was pressed: the second one on 2 / 2', async () => {
    renderPage(<ReceiptsField value={[picture('a.jpg'), picture('b.jpg')]} />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 2' }))

    await waitFor(() => expect(counter()).toBe('2 / 2'))
  })

  it('does not open the viewer when the x is pressed, which takes the photo off', async () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField value={[picture('a.jpg'), picture('b.jpg')]} onChange={onChange} />)
    await screen.findByRole('img', { name: 'Receipt photo 1' })

    await userEvent.click(screen.getByRole('button', { name: /Remove receipt photo 1$/ }))

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'b.jpg' })])
    expect(viewer()).toBeNull()
  })

  it('shows a stored photo\'s thumbnail but opens its full-size picture, a different one', async () => {
    renderPage(<ReceiptsField stored={[{ id: 'a', mimeType: 'image/jpeg', sizeBytes: 1 }]} photoStore={fakeStore()} />)
    const thumbnail = await screen.findByRole('img', { name: 'Receipt photo 1' })

    await userEvent.click(thumbnail)

    await waitFor(() => expect(viewer()).not.toBeNull())
    const shown = document.querySelector('.ant-image-preview-img') as HTMLImageElement
    expect(shown.src).toMatch(/^blob:/)
    expect(shown.src).not.toBe((thumbnail as HTMLImageElement).src)
  })

  it('opens the stored photos in the order shown, even when a later one was read first', async () => {
    const stored = [
      { id: 'a', mimeType: 'image/jpeg', sizeBytes: 1 },
      { id: 'b', mimeType: 'image/jpeg', sizeBytes: 1 },
    ]
    renderPage(<ReceiptsField stored={stored} photoStore={fakeStore({ a: 30, b: 0 })} />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 1' }))

    await waitFor(() => expect(counter()).toBe('1 / 2'))
    expect(disabled(previous())).toBe(true)
  })

  it('counts stored photos before chosen ones in one viewer', async () => {
    const stored = [{ id: 'a', mimeType: 'image/jpeg', sizeBytes: 1 }]
    renderPage(<ReceiptsField stored={stored} photoStore={fakeStore({ a: 20 })} value={[picture('new.jpg')]} />)

    await userEvent.click(await screen.findByRole('img', { name: 'Receipt photo 1' }))

    await waitFor(() => expect(counter()).toBe('1 / 2'))
  })

  it('keeps an empty square, with its x, for a stored photo until it is read', async () => {
    const onStoredChange = vi.fn()
    const stored = [{ id: 'a', mimeType: 'image/jpeg', sizeBytes: 1 }]
    renderPage(<ReceiptsField stored={stored} photoStore={fakeStore({ a: 50 })} onStoredChange={onStoredChange} />)

    expect(screen.queryByRole('img', { name: 'Receipt photo 1' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Remove receipt photo 1$/ }))

    expect(onStoredChange).toHaveBeenCalledWith([])
  })
})
