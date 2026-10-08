// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useObjectUrl } from '../index.ts'

describe('useObjectUrl', () => {
  it('gives an address for a Blob and frees it when the Blob changes or the component goes away', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const first = new Blob(['a'])
    const second = new Blob(['b'])

    const { result, rerender, unmount } = renderHook(({ blob }) => useObjectUrl(blob), {
      initialProps: { blob: first as Blob | null },
    })
    const firstUrl = result.current
    expect(firstUrl).toMatch(/^blob:/)

    rerender({ blob: second })
    expect(result.current).toMatch(/^blob:/)
    expect(result.current).not.toBe(firstUrl)
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(firstUrl))

    const secondUrl = result.current
    unmount()
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(secondUrl))
  })

  it('shares one address between components showing the same Blob, freeing it after the last', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockClear()
    const blob = new Blob(['shared'])
    const one = renderHook(() => useObjectUrl(blob))
    const two = renderHook(() => useObjectUrl(blob))
    expect(two.result.current).toBe(one.result.current)

    one.unmount()
    await Promise.resolve()
    expect(revoke).not.toHaveBeenCalledWith(one.result.current)
    two.unmount()
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(one.result.current))
  })

  it('is null without a Blob', () => {
    const { result } = renderHook(() => useObjectUrl(null))
    expect(result.current).toBeNull()
  })
})
