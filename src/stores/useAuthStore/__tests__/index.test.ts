// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_KEY, useAuthStore, validToken } from '../index.ts'

const profile = { id: '1', email: 'a@example.com', name: 'A' }

describe('auth store', () => {
  beforeEach(() => useAuthStore.setState({ profile: null, guest: false, token: null }))

  it('keeps the profile and token after sign-in', () => {
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
    expect(useAuthStore.getState().profile).toEqual(profile)
    expect(useAuthStore.getState().token?.value).toBe('t')
  })

  it('starts as neither signed in nor a guest', () => {
    expect(useAuthStore.getState()).toMatchObject({ profile: null, guest: false, token: null })
  })

  it('continues as a guest, with no profile and no token', () => {
    useAuthStore.getState().startGuest()

    expect(useAuthStore.getState()).toMatchObject({ profile: null, guest: true, token: null })
  })

  it('is not a guest any more once signed in', () => {
    useAuthStore.getState().startGuest()
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })

    expect(useAuthStore.getState().guest).toBe(false)
    expect(useAuthStore.getState().profile).toEqual(profile)
  })

  it('exits guest mode with sign-out', () => {
    useAuthStore.getState().startGuest()
    useAuthStore.getState().signOut()

    expect(useAuthStore.getState()).toMatchObject({ profile: null, guest: false })
  })

  it('keeps the profile, or the guest flag, on the device, but not the token', () => {
    useAuthStore.getState().startGuest()
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}').state).toEqual({ profile: null, guest: true })

    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}').state).toEqual({ profile, guest: false })
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
