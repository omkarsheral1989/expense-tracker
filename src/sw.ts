/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { addWorkerHandlers } from './pwa/workerHandlers.ts'
import { logService } from './services/logService'

declare const self: ServiceWorkerGlobalScope

// The files of the build, listed by vite-plugin-pwa (ADR-022). The plugin
// replaces this one expression, so it must appear once in this file.
const precached = self.__WB_MANIFEST
precacheAndRoute(precached)
cleanupOutdatedCaches()
logService.scope('sw').info('Precaching', { files: precached.length })
// Deep links open the app, offline too.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Sharing from other apps (PRD 5.11, ADR-047), updates (ADR-022) and logs (ADR-048).
addWorkerHandlers({
  registration: self.registration,
  skipWaiting: () => self.skipWaiting(),
  addEventListener: (type, listener) => self.addEventListener(type, listener as unknown as EventListener),
})
