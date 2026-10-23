/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { receiveShare } from './pwa/shareTarget.ts'

declare const self: ServiceWorkerGlobalScope

// The app's scope, such as https://omkarsheral1989.github.io/ownledger/ (ADR-032).
const SCOPE = self.registration.scope
const SHARE_TARGET_URL = `${SCOPE}share-target`
const SHARE_LANDING_URL = `${SCOPE}share`

// The files of the build, listed by vite-plugin-pwa (ADR-022).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Deep links open the app, offline too.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// A pictures-and-text share from another app (PRD 5.11, ADR-047).
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method === 'POST' && request.url === SHARE_TARGET_URL) {
    event.respondWith(receiveShare(request, SHARE_LANDING_URL))
  }
})

// The update prompt (PwaUpdatePrompt) asks a waiting worker to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
