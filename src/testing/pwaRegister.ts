/**
 * Stands in for `virtual:pwa-register/react`, which only exists inside the PWA
 * plugin's build. Nothing needs updating in tests; a test of the update prompt
 * replaces this module with `vi.mock`.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  }
}
