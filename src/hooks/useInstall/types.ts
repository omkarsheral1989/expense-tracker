import type { Platform } from '../../pwa/platform.ts'

/** Chromium's install prompt event, which TypeScript's DOM types do not include. */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = {
  platform: Platform
  /** Running as an installed home-screen app. */
  installed: boolean
  /** The browser offered a native install prompt (Chromium on Android/desktop). */
  canPrompt: boolean
  promptInstall: () => Promise<void>
}
