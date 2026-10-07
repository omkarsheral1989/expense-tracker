import { useState, useSyncExternalStore } from 'react'
import {
  detectPlatform,
  devOverrides,
  isStandalone,
  type Platform,
} from './platform.ts'

/** Chromium's install prompt event, which TypeScript's DOM types do not include. */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The browser fires `beforeinstallprompt` once, possibly before React mounts,
// so it is captured at module load and shared through a tiny store.
let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedThisSession = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  emit()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  installedThisSession = true
  emit()
})

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const mql = window.matchMedia('(display-mode: standalone)')
  mql.addEventListener('change', onChange)
  return () => {
    listeners.delete(onChange)
    mql.removeEventListener('change', onChange)
  }
}

const getCanPrompt = () => deferredPrompt !== null
const getInstalled = () => installedThisSession || isStandalone()

export type InstallState = {
  platform: Platform
  /** Running as an installed home-screen app. */
  installed: boolean
  /** The browser offered a native install prompt (Chromium on Android/desktop). */
  canPrompt: boolean
  promptInstall: () => Promise<void>
}

export function useInstall(): InstallState {
  const [overrides] = useState(devOverrides)
  const [platform] = useState<Platform>(
    () => overrides.platform ?? detectPlatform(navigator),
  )
  const installed = useSyncExternalStore(subscribe, getInstalled)
  const canPrompt = useSyncExternalStore(subscribe, getCanPrompt)

  async function promptInstall() {
    const prompt = deferredPrompt
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    // A prompt can only be used once, whatever the user chose.
    deferredPrompt = null
    emit()
  }

  return {
    platform,
    installed: overrides.installed ?? installed,
    canPrompt,
    promptInstall,
  }
}
