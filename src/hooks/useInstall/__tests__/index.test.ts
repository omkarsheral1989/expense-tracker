// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useInstall } from '../index.ts'

/** The event Chrome fires when the app can be installed. */
function installPromptEvent(choice: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome: choice })
  return event
}

// The hook keeps the browser's one-time install event at module level, so these
// tests run in order and each ends with the state the next expects.
describe('useInstall', () => {
  it('cannot prompt before the browser offers installing, and is not skipped', () => {
    const { result } = renderHook(() => useInstall())
    expect(result.current.canPrompt).toBe(false)
    expect(result.current.skipped).toBe(false)
  })

  it('holds back the browser\'s own banner and can then prompt', () => {
    const { result } = renderHook(() => useInstall())
    const event = installPromptEvent()

    act(() => {
      window.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(result.current.canPrompt).toBe(true)
  })

  it('shows the browser\'s install prompt once, whatever the user chose', async () => {
    const { result } = renderHook(() => useInstall())
    const event = installPromptEvent('dismissed')
    act(() => {
      window.dispatchEvent(event)
    })

    await act(() => result.current.promptInstall())

    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(result.current.canPrompt).toBe(false)
    // With no prompt left, asking again does nothing.
    await act(() => result.current.promptInstall())
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('counts the app as installed once the browser says it was', () => {
    const { result } = renderHook(() => useInstall())
    expect(result.current.installed).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.installed).toBe(true)
    expect(result.current.canPrompt).toBe(false)
  })

  it('remembers "Continue in browser anyway" across screens until the page reloads', () => {
    const first = renderHook(() => useInstall())
    act(() => first.result.current.skipInstall())
    expect(first.result.current.skipped).toBe(true)

    const second = renderHook(() => useInstall())
    expect(second.result.current.skipped).toBe(true)
  })
})
