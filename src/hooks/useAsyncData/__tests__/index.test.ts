// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAsyncData } from '../index.ts'

/** A promise a test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsyncData', () => {
  afterEach(cleanup)

  it('is loading until the data arrives, then ready with it', async () => {
    const load = deferred<string>()
    const { result } = renderHook(() => useAsyncData(() => load.promise, 'a'))

    expect(result.current.state).toEqual({ status: 'loading' })

    await act(async () => load.resolve('hello'))
    expect(result.current.state).toEqual({ status: 'ready', data: 'hello' })
  })

  it('reports an error, and turns a thrown value that is not an Error into one', async () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.reject('plain text'), 'a'),
    )

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toEqual({ status: 'error', error: new Error('plain text') })
  })

  it('loads again when retried, going back to loading first', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('second time')
    const { result } = renderHook(() => useAsyncData(load, 'a'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    act(() => result.current.retry())
    expect(result.current.state).toEqual({ status: 'loading' })

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', data: 'second time' }),
    )
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads again when the key changes', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => useAsyncData(async () => `data for ${key}`, key),
      { initialProps: { key: 'a' } },
    )
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'data for a' }))

    rerender({ key: 'b' })

    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'data for b' }))
  })

  it('never lets a slow earlier load overwrite a newer one', async () => {
    const slow = deferred<string>()
    const loads: Record<string, Promise<string>> = {
      a: slow.promise,
      b: Promise.resolve('data for b'),
    }
    const { result, rerender } = renderHook(
      ({ key }) => useAsyncData(() => loads[key], key),
      { initialProps: { key: 'a' } },
    )

    rerender({ key: 'b' })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 'data for b' }))

    await act(async () => slow.resolve('stale data for a'))
    expect(result.current.state).toEqual({ status: 'ready', data: 'data for b' })
  })

  it('ignores a result that arrives after the component is gone', async () => {
    const load = deferred<string>()
    const { unmount } = renderHook(() => useAsyncData(() => load.promise, 'a'))
    unmount()

    // Nothing to assert on a gone component; this must simply not throw or warn.
    await act(async () => load.resolve('too late'))
  })
})
