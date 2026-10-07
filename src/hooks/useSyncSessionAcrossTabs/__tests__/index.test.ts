// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncSessionAcrossTabs } from '../index.ts'

const profile = { id: '1', email: 'a@example.com', name: 'A' }

function changeStorageInOtherTab(key: string | null, newValue: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
}

describe('useSyncSessionAcrossTabs', () => {
  afterEach(cleanup)

  beforeEach(() => {
    renderHook(() => useSyncSessionAcrossTabs())
    useAuthStore.getState().signIn(profile, { value: 't', expiresAt: 1 })
  })

  it('signs out when another tab removes the stored session', () => {
    changeStorageInOtherTab('ownledger-session', null)
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('signs out when the whole storage is cleared', () => {
    changeStorageInOtherTab(null, null)
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('ignores changes to other stored items', () => {
    changeStorageInOtherTab('something-else', null)
    expect(useAuthStore.getState().profile).toEqual(profile)
  })
})
