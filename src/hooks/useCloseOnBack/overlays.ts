import { slide } from '../useAppNavigate/utils.ts'

/** An open overlay (a sheet, dialog or confirmation) that holds a step of the browser's history (PRD 5.19, ADR-063). */
export type Overlay = {
  /** Closes the overlay, as its close button does. */
  close: () => void
  /** False while the overlay must stay (the sync dialog during a run): Back then does nothing. */
  dismissible: () => boolean
  /** Its history step still exists: false once Back removed it or a page change dropped it. */
  entry: boolean
}

/** How long a page change waits for the history to settle after the overlays' steps were removed (ms), before it goes on anyway. */
export const DROP_TIMEOUT_MS = 150

/** The open overlays, the one opened last at the end. */
const stack: Overlay[] = []
/** Steps of overlays that closed in this tick, removed once it ends unless an overlay opens and takes one over (React's development remount). */
let unclaimed = 0
let removal: ReturnType<typeof setTimeout> | undefined
/** What waits for the history to settle after `dropAll`. */
let afterDrop: (() => void)[] = []
let dropTimer: ReturnType<typeof setTimeout> | undefined
/** How many overlays were open at the history step the app was on before the latest move, so a move off an overlay's step is recognized as one. */
let lastMarker = 0

/** The overlays' marker, kept in `history.state` beside the router's own `usr`, `key` and `idx`: how many overlays are open at that step. */
function markerOf(state: unknown): number {
  const marker = (state as { overlay?: unknown } | null)?.overlay
  return typeof marker === 'number' ? marker : 0
}

function removeUnclaimed() {
  removal = undefined
  if (unclaimed === 0) return
  const steps = unclaimed
  unclaimed = 0
  window.history.go(-steps)
}

/**
 * An overlay opens: it takes a step of the history, with the same page entry (the router's `key` and `idx` are copied, so the page does
 * not change and the app's history rules keep seeing one entry per page, ADR-059), so that Back can close it.
 */
export function openOverlay(overlay: Omit<Overlay, 'entry'>): Overlay {
  const opened: Overlay = { ...overlay, entry: true }
  stack.push(opened)
  if (unclaimed > 0) {
    // An overlay that closed a moment ago left its step: take it over instead of adding another.
    unclaimed -= 1
    if (unclaimed === 0 && removal !== undefined) {
      clearTimeout(removal)
      removal = undefined
    }
    return opened
  }
  window.history.pushState({ ...window.history.state, overlay: stack.length }, '')
  lastMarker = stack.length
  return opened
}

/** An overlay closed. If it closed by Back, or a page change dropped its step, there is nothing more to do; otherwise its step is removed. */
export function releaseOverlay(overlay: Overlay) {
  const index = stack.indexOf(overlay)
  if (index >= 0) stack.splice(index, 1)
  if (!overlay.entry) return
  overlay.entry = false
  unclaimed += 1
  removal ??= setTimeout(removeUnclaimed, 0)
}

/** How many overlays are open. */
export function openOverlayCount(): number {
  return stack.length
}

/**
 * Removes the steps of every open overlay, then runs `then` once the history has settled: a page change made while overlays are open
 * must end with the same history as without them (ADR-059). The overlays themselves close with the page change.
 */
export function dropAll(then: () => void) {
  let steps = unclaimed
  for (const overlay of stack) {
    if (overlay.entry) steps += 1
    overlay.entry = false
  }
  stack.length = 0
  unclaimed = 0
  if (removal !== undefined) {
    clearTimeout(removal)
    removal = undefined
  }
  if (steps === 0) {
    then()
    return
  }
  afterDrop.push(then)
  window.history.go(-steps)
  // The popstate that follows runs it; this is only for a history that never answers.
  dropTimer ??= setTimeout(runAfterDrop, DROP_TIMEOUT_MS)
}

function runAfterDrop() {
  clearTimeout(dropTimer)
  dropTimer = undefined
  const waiting = afterDrop
  afterDrop = []
  for (const then of waiting) then()
}

/**
 * Handles a `popstate` that only moves between steps of the page the app is on (same router `key`): the overlays' steps. Back closes the
 * overlay that opened last, one per step; an overlay that must stay (not dismissible) gets its step back. The router must not see
 * these events (it would treat them as a page change), so they are held back from it. Returns whether the event was one of these.
 * Called by `installSlideOnBrowserBack`, which runs before the router's own listener.
 */
export function handleOverlayPop(event: PopStateEvent): boolean {
  const state = window.history.state as { key?: string } | null
  const marker = markerOf(state)
  const before = lastMarker
  lastMarker = marker
  // Only a move between an overlay's steps of this page entry is ours: not a page change, and not a move that no overlay is part of
  // (a #fragment). Moving off an overlay's step counts, so the step an overlay's removal lands on is swallowed too.
  const overlayMove = marker > 0 || before > 0 || stack.length > 0
  if ((state?.key ?? 'default') !== slide.key || !overlayMove) return false
  event.stopImmediatePropagation()

  while (stack.length > marker) {
    const top = stack[stack.length - 1]
    if (!top.dismissible()) {
      // It stays: put its step back, so Back has something to remove next time.
      window.history.pushState({ ...state, overlay: stack.length }, '')
      lastMarker = stack.length
      break
    }
    stack.pop()
    top.entry = false
    top.close()
  }
  if (afterDrop.length) runAfterDrop()
  return true
}

/**
 * A page that was reloaded with an overlay open starts on its plain page: the steps the overlays held are walked back, without the
 * router noticing, so the browser's Back goes to the page before in one press (PRD 5.19). Call before the router is made.
 */
export function cleanUpAfterReload(): boolean {
  const marker = markerOf(window.history.state)
  if (marker === 0) return false
  lastMarker = marker
  window.history.go(-marker)
  return true
}
