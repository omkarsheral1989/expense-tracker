// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../../../db/client.ts'
import { useDatabaseSession } from '../index.ts'

const session = vi.hoisted(() => ({ start: vi.fn(), end: vi.fn() }))
vi.mock('../../../db/session.ts', () => ({ databaseSession: session }))

const db = {} as Database

beforeEach(() => {
  session.start.mockReset()
  session.end.mockReset()
  session.end.mockResolvedValue(undefined)
})

describe('useDatabaseSession', () => {
  it('is loading first, then ready with the database', async () => {
    session.start.mockResolvedValue({ status: 'ready', db })
    const { result } = renderHook(() => useDatabaseSession('data-1'))

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', db }))
    expect(session.start).toHaveBeenCalledWith('data-1')
  })

  it('says the data is locked when another tab has it', async () => {
    session.start.mockResolvedValue({ status: 'locked' })
    const { result } = renderHook(() => useDatabaseSession('data-1'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'locked' }))
  })

  it('reports the error when opening fails, whatever was thrown', async () => {
    session.start.mockRejectedValueOnce(new Error('disk full'))
    const { result, unmount } = renderHook(() => useDatabaseSession('data-1'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toMatchObject({ error: expect.objectContaining({ message: 'disk full' }) })
    unmount()

    session.start.mockRejectedValueOnce('plain text')
    const second = renderHook(() => useDatabaseSession('data-2'))
    await waitFor(() => expect(second.result.current.state.status).toBe('error'))
    expect(second.result.current.state).toMatchObject({ error: expect.objectContaining({ message: 'plain text' }) })
  })

  it('tries again when retry is called, showing loading in between', async () => {
    session.start.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ status: 'ready', db })
    const { result } = renderHook(() => useDatabaseSession('data-1'))
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', db }))
    expect(session.start).toHaveBeenCalledTimes(2)
  })

  it('closes the session when the component goes away', async () => {
    session.start.mockResolvedValue({ status: 'ready', db })
    const { unmount } = renderHook(() => useDatabaseSession('data-1'))
    await waitFor(() => expect(session.start).toHaveBeenCalled())
    unmount()
    expect(session.end).toHaveBeenCalled()
  })

  it('ignores a result that arrives after the component went away', async () => {
    let finish: (value: unknown) => void = () => {}
    session.start.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { result, unmount } = renderHook(() => useDatabaseSession('data-1'))
    unmount()
    finish({ status: 'ready', db })
    await Promise.resolve()
    expect(result.current.state).toEqual({ status: 'loading' })
  })
})
