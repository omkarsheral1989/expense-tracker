// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slide } from '../../useAppNavigate/utils.ts'
import {
  cleanUpAfterReload,
  DROP_TIMEOUT_MS,
  dropAll,
  handleOverlayPop,
  openOverlay,
  openOverlayCount,
  releaseOverlay,
  type Overlay,
} from '../overlays.ts'

// The history steps of overlays (PRD 5.19, ADR-063), against jsdom's real history.

/** What the router's own listener would see: added after ours, as the router is made after `installSlideOnBrowserBack`. */
const routerHears = vi.fn()
const opened: Overlay[] = []

function open(options: { dismissible?: () => boolean } = {}) {
  const close = vi.fn()
  const overlay = openOverlay({ close, dismissible: options.dismissible ?? (() => true) })
  opened.push(overlay)
  return { overlay, close }
}

/** Waits for the history to move: jsdom sends `popstate` a moment later, and the overlay handler holds it back from other listeners. */
function popstate() {
  return new Promise<void>((resolve) => setTimeout(resolve, 30))
}

async function back() {
  window.history.back()
  // jsdom moves the history a moment later; the overlay handler holds the event back from other listeners, so wait on time.
  await new Promise((resolve) => setTimeout(resolve, 30))
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30))
const state = () => window.history.state as { key?: string; idx?: number; overlay?: number } | null

beforeEach(async () => {
  await tick()
  window.history.replaceState({ usr: null, key: 'page', idx: 0 }, '', '/')
  slide.key = 'page'
  // The handler remembers the step the app was last on: start from a plain page, whatever an earlier test left.
  handleOverlayPop(new PopStateEvent('popstate'))
  window.addEventListener('popstate', handleOverlayPop)
  window.addEventListener('popstate', routerHears)
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const overlay of opened.splice(0)) releaseOverlay(overlay)
  await tick()
  window.removeEventListener('popstate', handleOverlayPop)
  window.removeEventListener('popstate', routerHears)
  routerHears.mockClear()
})

describe('opening an overlay', () => {
  it('takes a step of the history on the same page entry, marked with how many overlays are open', () => {
    const before = window.history.length

    open()
    expect(window.history.length).toBe(before + 1)
    expect(state()).toEqual({ usr: null, key: 'page', idx: 0, overlay: 1 })

    open()
    expect(state()).toMatchObject({ key: 'page', idx: 0, overlay: 2 })
    expect(openOverlayCount()).toBe(2)
  })
})

describe('Back with overlays open', () => {
  it('closes the overlay that opened last, one per step, and the router does not hear of it', async () => {
    const first = open()
    const second = open()

    await back()
    expect(second.close).toHaveBeenCalledTimes(1)
    expect(first.close).not.toHaveBeenCalled()
    expect(state()?.overlay).toBe(1)
    expect(openOverlayCount()).toBe(1)

    await back()
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
    expect(routerHears).not.toHaveBeenCalled()
  })

  it('leaves an overlay that must stay: its step is put back so Back has something to remove next time', async () => {
    let dismissible = false
    const { close } = open({ dismissible: () => dismissible })
    const length = window.history.length

    await back()

    expect(close).not.toHaveBeenCalled()
    expect(openOverlayCount()).toBe(1)
    expect(state()?.overlay).toBe(1)
    expect(window.history.length).toBe(length)
    expect(routerHears).not.toHaveBeenCalled()

    dismissible = true
    await back()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does nothing when it was not an overlay that Back removed: a move to another page entry goes on to the router', () => {
    open()
    window.history.pushState({ usr: null, key: 'other', idx: 1 }, '')

    const handled = handleOverlayPop(new PopStateEvent('popstate'))

    expect(handled).toBe(false)
  })

  it('treats a move onto a step that no overlay holds as nothing: Forward reopens nothing and the router does not hear of it', async () => {
    const { close } = open()
    await back()
    close.mockClear()

    window.history.forward()
    await popstate()

    expect(close).not.toHaveBeenCalled()
    expect(openOverlayCount()).toBe(0)
    expect(routerHears).not.toHaveBeenCalled()
  })
})

describe('closing an overlay any other way', () => {
  it('removes its step once the tick ends, without the router hearing of it', async () => {
    const { overlay } = open()
    const length = window.history.length

    releaseOverlay(overlay)
    expect(window.history.length).toBe(length)
    await tick()
    await tick()

    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
    expect(routerHears).not.toHaveBeenCalled()
  })

  it('does not remove a step that Back already removed', async () => {
    const { overlay } = open()
    await back()
    const back2 = vi.spyOn(window.history, 'go')

    releaseOverlay(overlay)
    await tick()

    expect(back2).not.toHaveBeenCalled()
  })

  it('lets an overlay that opens in the same tick take over the step of one that just closed (the development remount)', async () => {
    const first = open()
    const length = window.history.length

    releaseOverlay(first.overlay)
    const second = open()
    await tick()
    await tick()

    expect(window.history.length).toBe(length)
    expect(state()?.overlay).toBe(1)
    expect(openOverlayCount()).toBe(1)
    await back()
    expect(second.close).toHaveBeenCalledTimes(1)
  })
})

describe('dropAll, for a page change made while overlays are open', () => {
  it('runs what waits at once when no overlay is open', () => {
    const then = vi.fn()

    dropAll(then)

    expect(then).toHaveBeenCalledTimes(1)
  })

  it('removes every overlay\'s step and only then runs what waits, without closing the overlays itself', async () => {
    const first = open()
    const second = open()
    const then = vi.fn()

    dropAll(then)
    expect(then).not.toHaveBeenCalled()
    await popstate()
    await tick()

    expect(then).toHaveBeenCalledTimes(1)
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
    expect(first.close).not.toHaveBeenCalled()
    expect(second.close).not.toHaveBeenCalled()
    expect(routerHears).not.toHaveBeenCalled()

    // The overlays close with the page change later; their steps are already gone.
    const go = vi.spyOn(window.history, 'go')
    releaseOverlay(first.overlay)
    releaseOverlay(second.overlay)
    await tick()
    expect(go).not.toHaveBeenCalled()
  })

  it('also drops the step of an overlay that closed a moment ago', async () => {
    const { overlay } = open()
    releaseOverlay(overlay)
    const then = vi.fn()

    dropAll(then)
    await popstate()
    await tick()

    expect(then).toHaveBeenCalledTimes(1)
    expect(state()?.overlay).toBeUndefined()
  })

  it('goes on anyway when the history never answers', () => {
    vi.useFakeTimers()
    open()
    vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const then = vi.fn()

    dropAll(then)
    vi.advanceTimersByTime(DROP_TIMEOUT_MS - 1)
    expect(then).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(then).toHaveBeenCalledTimes(1)
  })
})

describe('cleaning up after a reload', () => {
  it('does nothing for a page with no overlay step', () => {
    const go = vi.spyOn(window.history, 'go')

    expect(cleanUpAfterReload()).toBe(false)
    expect(go).not.toHaveBeenCalled()
  })

  it('walks back the steps a reloaded page left behind, without the router hearing of it', async () => {
    window.history.pushState({ usr: null, key: 'page', idx: 0, overlay: 1 }, '')
    window.history.pushState({ usr: null, key: 'page', idx: 0, overlay: 2 }, '')

    expect(cleanUpAfterReload()).toBe(true)
    await popstate()

    expect(state()).toEqual({ usr: null, key: 'page', idx: 0 })
    expect(routerHears).not.toHaveBeenCalled()
  })
})
