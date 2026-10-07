// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLeaveWarning } from '../index.ts'

/** Fires the event the browser sends before a reload or close; true if blocked. */
function tryToLeave() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveWarning', () => {
  afterEach(cleanup)

  it('does nothing while it is not active', () => {
    renderHook(() => useLeaveWarning(false))
    expect(tryToLeave()).toBe(false)
  })

  it('makes the browser ask while it is active', () => {
    renderHook(() => useLeaveWarning(true))
    expect(tryToLeave()).toBe(true)
  })

  it('starts and stops asking as it changes', () => {
    const { rerender } = renderHook(({ active }) => useLeaveWarning(active), {
      initialProps: { active: false },
    })
    rerender({ active: true })
    expect(tryToLeave()).toBe(true)
    rerender({ active: false })
    expect(tryToLeave()).toBe(false)
  })

  it('stops asking once the component is gone', () => {
    const { unmount } = renderHook(() => useLeaveWarning(true))
    unmount()
    expect(tryToLeave()).toBe(false)
  })
})
