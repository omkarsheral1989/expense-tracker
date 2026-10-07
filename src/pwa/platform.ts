export type Platform = 'ios' | 'android' | 'desktop'

type NavigatorLike = {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}

export function detectPlatform(nav: NavigatorLike): Platform {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return 'ios'
  // iPadOS 13+ identifies itself as a Mac, but a Mac has no multi-touch screen.
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return 'ios'
  if (/Android/.test(nav.userAgent)) return 'android'
  return 'desktop'
}

/** True when the app runs as an installed PWA (home-screen app). */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone
  return (
    iosStandalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/**
 * Development-only overrides so every case can be tried on one machine:
 * `?platform=ios|android|desktop` and `?installed=1`.
 */
export function devOverrides(): {
  platform?: Platform
  installed?: boolean
} {
  if (!import.meta.env.DEV) return {}
  const params = new URLSearchParams(window.location.search)
  const platform = params.get('platform')
  return {
    platform:
      platform === 'ios' || platform === 'android' || platform === 'desktop'
        ? platform
        : undefined,
    installed: params.get('installed') === '1' ? true : undefined,
  }
}
