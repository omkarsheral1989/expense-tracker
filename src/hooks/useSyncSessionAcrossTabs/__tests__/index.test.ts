// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SESSION_KEY, useAuthStore } from '../../../stores/useAuthStore'
import { useSyncSessionAcrossTabs } from '../index.ts'

const profile = { id: '1', email: 'a@example.com', name: 'A' }
const otherProfile = { id: '2', email: 'b@example.com', name: 'B' }

/** What another tab does: change the stored session, which tells this tab. */
function otherTabStores(session: { profile: typeof profile | null } | null) {
  const newValue =
    session === null ? null : JSON.stringify({ state: session, version: 0 })

  if (newValue === null) localStorage.removeItem(SESSION_KEY)
  else localStorage.setItem(SESSION_KEY, newValue)

  window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, newValue }))
}

describe('useSyncSessionAcrossTabs', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localStorage.clear()
    renderHook(() => useSyncSessionAcrossTabs())
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
  })

  it('signs out when another tab removes the stored session', () => {
    otherTabStores(null)
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('signs out and drops the token when another tab stores a signed-out session', async () => {
    otherTabStores({ profile: null })
    await waitFor(() => expect(useAuthStore.getState().profile).toBeNull())
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('shows another tab\'s sign-in, without sharing its access token', async () => {
    useAuthStore.setState({ profile: null, token: null })

    otherTabStores({ profile: otherProfile })

    await waitFor(() => expect(useAuthStore.getState().profile).toEqual(otherProfile))
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('signs out when the whole storage is cleared', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }))
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('ignores changes to other stored items', () => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'something-else', newValue: null }),
    )
    expect(useAuthStore.getState().profile).toEqual(profile)
  })

  it('stops listening once the component is gone', () => {
    cleanup()
    otherTabStores(null)
    expect(useAuthStore.getState().profile).toEqual(profile)
  })
})
