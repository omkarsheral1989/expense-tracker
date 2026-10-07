import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore, validToken } from '../index.ts'

const profile = { id: '1', email: 'a@example.com', name: 'A' }

describe('auth store', () => {
  beforeEach(() => useAuthStore.setState({ profile: null, token: null }))

  it('keeps the profile and token after sign-in', () => {
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
    expect(useAuthStore.getState().profile).toEqual(profile)
    expect(useAuthStore.getState().token?.value).toBe('t')
  })

  it('clears everything on sign-out', () => {
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
    useAuthStore.getState().signOut()
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })
})

describe('validToken', () => {
  const now = 1_000_000

  it('returns the token while it has more than a minute left', () => {
    expect(validToken({ value: 't', expiresAt: now + 120_000 }, now)).toBe('t')
  })

  it('returns null when expired, nearly expired or missing', () => {
    expect(validToken({ value: 't', expiresAt: now - 1 }, now)).toBeNull()
    expect(validToken({ value: 't', expiresAt: now + 30_000 }, now)).toBeNull()
    expect(validToken(null, now)).toBeNull()
  })
})
