import { logService } from '../services/logService'
import { receiveShare } from './shareTarget.ts'

const log = logService.scope('sw')

/** The one fetch event the handlers use: the request, and a way to answer it. */
export type WorkerFetchEvent = {
  request: Request
  respondWith: (response: Promise<Response>) => void
}

/** The message event the update prompt sends (`{ type: 'SKIP_WAITING' }`). */
export type WorkerMessageEvent = { data?: { type?: string } }

/** The part of the service worker's global scope the handlers need, so tests can stand in for it. */
export type WorkerScope = {
  registration: { scope: string }
  addEventListener: (type: string, listener: (event: never) => void) => void
  skipWaiting: () => Promise<void>
}

/**
 * The service worker's own behavior, beside the precaching `src/sw.ts` sets
 * up: answer the share sheet's POST (PRD 5.11, ADR-047), take over when the
 * update prompt says so (ADR-022), and log what happens (ADR-048).
 */
export function addWorkerHandlers(worker: WorkerScope) {
  // The app's scope, such as https://omkarsheral1989.github.io/ownledger/ (ADR-032).
  const scope = worker.registration.scope
  const shareTargetUrl = `${scope}share-target`
  const shareLandingUrl = `${scope}share`

  const onFetch = (event: WorkerFetchEvent) => {
    const { request } = event
    if (request.method === 'POST' && request.url === shareTargetUrl) {
      log.info('Share target request')
      event.respondWith(receiveShare(request, shareLandingUrl))
    }
  }
  worker.addEventListener('fetch', onFetch as (event: never) => void)

  worker.addEventListener('install', (() => log.info('Installed')) as (event: never) => void)
  worker.addEventListener('activate', (() => log.info('Activated')) as (event: never) => void)

  const onMessage = (event: WorkerMessageEvent) => {
    if (event.data?.type === 'SKIP_WAITING') {
      log.info('Update accepted, taking over')
      void worker.skipWaiting()
    }
  }
  worker.addEventListener('message', onMessage as (event: never) => void)

  log.info('Service worker started', { scope })
}
