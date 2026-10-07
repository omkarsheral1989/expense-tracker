import { useEffect } from 'react'
import { SESSION_KEY, useAuthStore } from '../../stores/useAuthStore'

/**
 * Keeps every open tab in step with the stored session. The browser tells the
 * other tabs when one changes it, so signing out in one tab signs out all of
 * them, and signing in shows up in the others. Call it once, in a component
 * that stays mounted for the whole app (`App`), so it also covers signed-out
 * pages.
 */
export function useSyncSessionAcrossTabs() {
  useEffect(() => {
    function syncSessionFromOtherTab(event: StorageEvent) {
      // A null key means the whole storage was cleared.
      if (event.key !== null && event.key !== SESSION_KEY) return

      if (event.newValue === null) {
        useAuthStore.setState({ profile: null, token: null })
        return
      }

      // Load the other tab's profile. The access token is not shared between
      // tabs, so a tab that is signed out has none, and a new one asks for its
      // own.
      void Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
        if (!useAuthStore.getState().profile) {
          useAuthStore.setState({ token: null })
        }
      })
    }

    window.addEventListener('storage', syncSessionFromOtherTab)
    return () => window.removeEventListener('storage', syncSessionFromOtherTab)
  }, [])
}
