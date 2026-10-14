import { useState, useSyncExternalStore } from 'react'
import {
  detectPlatform,
  devOverrides,
  isStandalone,
  type Platform,
} from '../../pwa/platform.ts'
import type { BeforeInstallPromptEvent, InstallState } from './types.ts'

// The browser fires `beforeinstallprompt` once, possibly before React mounts,
// so it is captured at module load and shared through a tiny store.
// Read once when the page loads, so `?platform=ios` (development only) keeps
// applying after the user moves between the app's pages.
const overrides = devOverrides()

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedThisSession = false
// "Continue in browser anyway" lasts until the page is reloaded, across pages.
let skippedInstall = false
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
const getSkipped = () => skippedInstall

export function useInstall(): InstallState {
  const [platform] = useState<Platform>(
    () => overrides.platform ?? detectPlatform(navigator),
  )
  const installed = useSyncExternalStore(subscribe, getInstalled)
  const canPrompt = useSyncExternalStore(subscribe, getCanPrompt)
  const skipped = useSyncExternalStore(subscribe, getSkipped)

  function skipInstall() {
    skippedInstall = true
    emit()
  }

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
    skipped,
    skipInstall,
  }
}
