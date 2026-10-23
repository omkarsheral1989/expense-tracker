// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../../../components/QueryProvider/client.ts'
import { useCachedData } from '../index.ts'

afterEach(() => {
  cleanup()
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
})

/** One cache shared by the renders of a test, as the app has one for all its pages. */
function setUp() {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { wrapper }
}

/** A promise settled from outside, to hold a read open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => ((resolve = done), (reject = fail)))
  return { promise, resolve, reject }
}

describe('useCachedData', () => {
  it('is loading on the first visit, then ready with the data', async () => {
    const { wrapper } = setUp()
    const { result } = renderHook(() => useCachedData(async () => 'groups', 'home'), { wrapper })

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'groups' }))
  })

  it('counts a result of null (nothing found) as ready', async () => {
    const { wrapper } = setUp()
    const { result } = renderHook(() => useCachedData(async () => null, 'missing'), { wrapper })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: null }))
  })

  describe('coming back to a page', () => {
    it('shows what it showed before at once, reads again, and then shows the new data', async () => {
      // One cache for both visits: the page was left and opened again.
      const { wrapper } = setUp()
      let version = 1
      const load = vi.fn(async () => `v${version}`)
      const first = renderHook(() => useCachedData(load, 'home'), { wrapper })
      await waitFor(() => expect(first.result.current.state).toEqual({ status: 'ready', data: 'v1' }))
      first.unmount()

      version = 2
      const again = deferred<string>()
      load.mockReturnValueOnce(again.promise)
      const second = renderHook(() => useCachedData(load, 'home'), { wrapper })

      // At once, before the second read finishes: the earlier data, not the loader.
      expect(second.result.current.state).toEqual({ status: 'ready', data: 'v1' })
      expect(load).toHaveBeenCalledTimes(2)

      await act(async () => again.resolve('v2'))
      await waitFor(() => expect(second.result.current.state).toEqual({ status: 'ready', data: 'v2' }))
    })

    it('keeps the earlier screen while the read behind it fails, then shows the failure', async () => {
      const { wrapper } = setUp()
      const load = vi.fn(async () => 'v1')
      const first = renderHook(() => useCachedData(load, 'home'), { wrapper })
      await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
      first.unmount()

      load.mockRejectedValueOnce(new Error('database is closed'))
      const second = renderHook(() => useCachedData(load, 'home'), { wrapper })
      expect(second.result.current.state).toEqual({ status: 'ready', data: 'v1' })
      await waitFor(() => expect(second.result.current.state.status).toBe('error'))
    })
  })

  it('remembers each key apart: another page, or another user, starts at loading', async () => {
    const { wrapper } = setUp()
    const first = renderHook(() => useCachedData(async () => 'mine', 'user-1:home'), { wrapper })
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
    first.unmount()

    const other = renderHook(() => useCachedData(async () => 'theirs', 'user-2:home'), { wrapper })
    expect(other.result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(other.result.current.state).toEqual({ status: 'ready', data: 'theirs' }))
  })

  describe('keepPrevious', () => {
    it('keeps showing the earlier data while a new key loads', async () => {
      const { wrapper } = setUp()
      const next = deferred<string>()
      const { result, rerender } = renderHook(
        ({ id }: { id: string }) => useCachedData(() => (id === 'a' ? Promise.resolve('A') : next.promise), id, { keepPrevious: true }),
        { wrapper, initialProps: { id: 'a' } },
      )
      await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'A' }))

      rerender({ id: 'b' })
      expect(result.current.state).toEqual({ status: 'ready', data: 'A' })

      await act(async () => next.resolve('B'))
      await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'B' }))
    })

    it('shows the loader for a new key without it', async () => {
      const { wrapper } = setUp()
      const next = deferred<string>()
      const { result, rerender } = renderHook(
        ({ id }: { id: string }) => useCachedData(() => (id === 'a' ? Promise.resolve('A') : next.promise), id),
        { wrapper, initialProps: { id: 'a' } },
      )
      await waitFor(() => expect(result.current.state.status).toBe('ready'))
      rerender({ id: 'b' })
      expect(result.current.state).toEqual({ status: 'loading' })
    })
  })

  describe('failures', () => {
    it('reports the error, wrapping anything that is not an Error', async () => {
      const { wrapper } = setUp()
      const { result } = renderHook(() => useCachedData(() => Promise.reject('plain text'), 'broken'), { wrapper })
      await waitFor(() => expect(result.current.state.status).toBe('error'))
      expect(result.current.state).toMatchObject({ error: expect.objectContaining({ message: 'plain text' }) })
    })

    it('does not try again by itself', async () => {
      const { wrapper } = setUp()
      const load = vi.fn(() => Promise.reject(new Error('boom')))
      const { result } = renderHook(() => useCachedData(load, 'broken'), { wrapper })
      await waitFor(() => expect(result.current.state.status).toBe('error'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('retry reads again, shows loading in between, and recovers', async () => {
      const { wrapper } = setUp()
      const retried = deferred<string>()
      const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('boom')).mockReturnValueOnce(retried.promise)
      const { result } = renderHook(() => useCachedData(load, 'home'), { wrapper })
      await waitFor(() => expect(result.current.state.status).toBe('error'))

      act(() => result.current.retry())
      await waitFor(() => expect(result.current.state).toEqual({ status: 'loading' }))

      await act(async () => retried.resolve('back'))
      await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'back' }))
    })

    it('retry joins a read that is already going instead of starting another', async () => {
      const { wrapper } = setUp()
      const slow = deferred<string>()
      const load = vi.fn(() => slow.promise)
      const { result } = renderHook(() => useCachedData(load, 'home'), { wrapper })
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

      act(() => result.current.retry())
      act(() => result.current.retry())

      expect(load).toHaveBeenCalledTimes(1)
      await act(async () => slow.resolve('x'))
    })
  })

  it('remembers a page for as long as the app is open, not just for a moment after it was left', async () => {
    const { wrapper } = setUp()
    const first = renderHook(() => useCachedData(async () => 'v1', 'home'), { wrapper })
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
    first.unmount()
    // Nothing is watching the page now; a cache that forgets idle entries would drop it.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const again = renderHook(() => useCachedData(() => new Promise<string>(() => {}), 'home'), { wrapper })
    expect(again.result.current.state).toEqual({ status: 'ready', data: 'v1' })
  })

  it('reads again every time a page opens, however recently it read', async () => {
    const { wrapper } = setUp()
    const load = vi.fn(async () => 'x')
    const first = renderHook(() => useCachedData(load, 'home'), { wrapper })
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
    first.unmount()
    renderHook(() => useCachedData(load, 'home'), { wrapper })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shows loading, not the old error, while a retry runs after a failed read behind a remembered page', async () => {
    const { wrapper } = setUp()
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('boom'))
    const first = renderHook(() => useCachedData(load, 'home'), { wrapper })
    await waitFor(() => expect(first.result.current.state.status).toBe('ready'))
    first.unmount()
    const second = renderHook(() => useCachedData(load, 'home'), { wrapper })
    await waitFor(() => expect(second.result.current.state.status).toBe('error'))

    const retried = deferred<string>()
    load.mockReturnValueOnce(retried.promise)
    act(() => second.result.current.retry())

    await waitFor(() => expect(second.result.current.state).toEqual({ status: 'loading' }))
    await act(async () => retried.resolve('v2'))
    await waitFor(() => expect(second.result.current.state).toEqual({ status: 'ready', data: 'v2' }))
  })

  it('works offline: the data is on the device', async () => {
    onlineManager.setOnline(false)
    const { wrapper } = setUp()
    const { result } = renderHook(() => useCachedData(async () => 'local', 'home'), { wrapper })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'local' }))
  })
})
