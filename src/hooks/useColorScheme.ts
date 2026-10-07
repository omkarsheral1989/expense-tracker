import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): 'light' | 'dark' {
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

/** The device's light/dark setting, updated live when it changes. */
export function useColorScheme() {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light' as const)
}
