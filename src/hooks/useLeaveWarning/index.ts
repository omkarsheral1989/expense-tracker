import { useEffect } from 'react'

/**
 * While `active`, makes the browser ask before the tab is reloaded or closed,
 * so unsaved input is not lost by accident. The browser shows its own wording
 * and ignores any custom text. It does not cover navigating inside the app;
 * pages do that themselves (for example a "Discard?" dialog on their Back
 * button).
 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
