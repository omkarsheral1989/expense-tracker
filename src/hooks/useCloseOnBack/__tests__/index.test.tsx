// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slide } from '../../useAppNavigate/utils.ts'
import { useCloseOnBack } from '../index.ts'
import { handleOverlayPop, openOverlayCount } from '../overlays.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 30))
const state = () => window.history.state as { overlay?: number } | null

async function back() {
  window.history.back()
  // jsdom moves the history a moment later; the overlay handler holds the event back from other listeners, so wait on time.
  await new Promise((resolve) => setTimeout(resolve, 30))
}

beforeEach(async () => {
  // History moves started by the last test (an overlay's step being removed) are over before this one starts.
  await tick()
  window.history.replaceState({ usr: null, key: 'page', idx: 0 }, '', '/')
  slide.key = 'page'
  window.addEventListener('popstate', handleOverlayPop)
})
afterEach(async () => {
  cleanup()
  await tick()
  window.removeEventListener('popstate', handleOverlayPop)
})

describe('useCloseOnBack', () => {
  it('holds a step of the history while open and none while closed', () => {
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn()), { initialProps: { open: false } })
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)

    rerender({ open: true })

    expect(state()?.overlay).toBe(1)
    expect(openOverlayCount()).toBe(1)
  })

  it('calls onClose when Back removes the step, and takes no second step back once it has closed', async () => {
    const onClose = vi.fn()
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, onClose), { initialProps: { open: true } })
    const length = window.history.length

    await back()
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender({ open: false })
    await tick()
    await tick()

    expect(window.history.length).toBe(length)
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('removes the step when the overlay closes any other way, so the next Back leaves the page', async () => {
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, vi.fn()), { initialProps: { open: true } })

    rerender({ open: false })
    await tick()
    await tick()

    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('removes the step when the component goes away', async () => {
    const { unmount } = renderHook(() => useCloseOnBack(true, vi.fn()))

    unmount()
    await tick()
    await tick()

    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('calls the latest onClose, not the one it opened with', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onClose }) => useCloseOnBack(true, onClose), { initialProps: { onClose: first } })

    rerender({ onClose: second })
    await back()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stays when not dismissible, and closes once it is', async () => {
    const onClose = vi.fn()
    const { rerender } = renderHook(({ dismissible }) => useCloseOnBack(true, onClose, dismissible), { initialProps: { dismissible: false } })

    await back()
    expect(onClose).not.toHaveBeenCalled()
    expect(state()?.overlay).toBe(1)

    rerender({ dismissible: true })
    await back()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes stacked overlays one at a time, the one opened last first', async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    renderHook(() => useCloseOnBack(true, lower))
    renderHook(() => useCloseOnBack(true, upper))
    expect(state()?.overlay).toBe(2)

    await act(async () => back())
    expect(upper).toHaveBeenCalledTimes(1)
    expect(lower).not.toHaveBeenCalled()

    await act(async () => back())
    expect(lower).toHaveBeenCalledTimes(1)
  })

  it('works through the development remount: one step added and none taken away, still closing on Back', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const go = vi.spyOn(window.history, 'go')
    const onClose = vi.fn()
    const { unmount } = renderHook(() => useCloseOnBack(true, onClose))
    // React's strict mode runs the effect, its cleanup and the effect again at once.
    unmount()
    renderHook(() => useCloseOnBack(true, onClose))
    await tick()

    expect(push).toHaveBeenCalledTimes(1)
    expect(go).not.toHaveBeenCalled()
    expect(state()?.overlay).toBe(1)
    go.mockRestore()
    await back()
    expect(onClose).toHaveBeenCalledTimes(1)
    push.mockRestore()
  })
})
