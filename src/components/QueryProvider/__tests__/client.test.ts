import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../client.ts'

describe('createQueryClient', () => {
  it('reads local data offline, never retries by itself, rereads on every open and keeps data until the app closes', () => {
    const { queries } = createQueryClient().getDefaultOptions()
    expect(queries).toMatchObject({
      networkMode: 'always',
      retry: false,
      staleTime: 0,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })
  })

  it('gives every app and every test its own cache', () => {
    expect(createQueryClient()).not.toBe(createQueryClient())
  })
})
