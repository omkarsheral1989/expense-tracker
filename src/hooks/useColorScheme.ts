import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

/** The device's color setting: what `useColorScheme()` returns. */
export type ColorScheme = 'light' | 'dark'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): ColorScheme {
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

/** The device's light/dark setting, updated live when it changes. */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light')
}
