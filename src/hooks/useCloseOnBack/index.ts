import { useEffect, useRef } from 'react'
import { openOverlay, releaseOverlay } from './overlays.ts'

/**
 * Makes the browser's Back button (and a phone's Back gesture) close an overlay instead of leaving the page (PRD 5.19, ADR-063): while
 * `open`, the overlay holds a step of the history, which Back removes and, by doing so, calls `onClose`. Closing the overlay any other
 * way removes its step again. With `dismissible` false the overlay stays when Back is pressed. With several open, one Back closes the
 * top one only.
 */
export function useCloseOnBack(open: boolean, onClose: () => void, dismissible = true) {
  const latest = useRef({ onClose, dismissible })
  useEffect(() => {
    latest.current = { onClose, dismissible }
  })

  useEffect(() => {
    if (!open) return
    const overlay = openOverlay({ close: () => latest.current.onClose(), dismissible: () => latest.current.dismissible })
    return () => releaseOverlay(overlay)
  }, [open])
}
