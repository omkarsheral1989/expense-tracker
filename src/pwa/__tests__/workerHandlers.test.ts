import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureLogs, messagesOf } from '../../testing/logs.ts'
import { sharedFiles } from '../sharedFiles.ts'
import { addWorkerHandlers, type WorkerFetchEvent, type WorkerMessageEvent, type WorkerScope } from '../workerHandlers.ts'

const SCOPE = 'https://example.test/ownledger/'
const logs = captureLogs()

type Listener = (event: never) => void

/** A stand-in for the service worker's scope that keeps the listeners added to it. */
function fakeWorker() {
  const listeners = new Map<string, Listener[]>()
  const skipWaiting = vi.fn(async () => {})
  const worker: WorkerScope = {
    registration: { scope: SCOPE },
    addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    skipWaiting,
  }
  const emit = (type: string, event: object = {}) => (listeners.get(type) ?? []).forEach((listener) => listener(event as never))
  return { worker, listeners, skipWaiting, emit }
}

function shareRequest(url: string, method = 'POST') {
  const form = new FormData()
  form.set('text', 'Receipt from the shop')
  return new Request(url, { method, ...(method === 'POST' ? { body: form } : {}) })
}

async function fetchThrough(emit: ReturnType<typeof fakeWorker>['emit'], request: Request) {
  const respondWith = vi.fn()
  emit('fetch', { request, respondWith } satisfies WorkerFetchEvent)
  return respondWith
}

beforeEach(async () => {
  await sharedFiles.clear()
})

describe('addWorkerHandlers', () => {
  it('listens for fetch, install, activate and message', () => {
    const { worker, listeners } = fakeWorker()
    addWorkerHandlers(worker)
    expect([...listeners.keys()].sort()).toEqual(['activate', 'fetch', 'install', 'message'])
  })

  it('logs that it started, with the scope', () => {
    addWorkerHandlers(fakeWorker().worker)
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ scope: 'sw', message: 'Service worker started', fields: { scope: SCOPE } }),
    )
  })

  it('logs install and activate', () => {
    const { worker, emit } = fakeWorker()
    addWorkerHandlers(worker)
    logs.clear()
    emit('install')
    emit('activate')
    expect(messagesOf(logs.lines)).toEqual(['sw: Installed', 'sw: Activated'])
  })

  describe('the share address', () => {
    it('answers a POST to it with a redirect to the share page, and keeps the shared text', async () => {
      const { worker, emit } = fakeWorker()
      addWorkerHandlers(worker)

      const respondWith = await fetchThrough(emit, shareRequest(`${SCOPE}share-target`))

      expect(respondWith).toHaveBeenCalledTimes(1)
      const response = await respondWith.mock.calls[0][0]
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(`${SCOPE}share`)
      expect((await sharedFiles.read())?.notes).toBe('Receipt from the shop')
      expect(messagesOf(logs.lines)).toContain('sw: Share target request')
    })

    it('leaves a GET of the same address to the network', async () => {
      const { worker, emit } = fakeWorker()
      addWorkerHandlers(worker)
      const respondWith = await fetchThrough(emit, shareRequest(`${SCOPE}share-target`, 'GET'))
      expect(respondWith).not.toHaveBeenCalled()
    })

    it.each([
      [`${SCOPE}other`],
      [`${SCOPE}share`],
      ['https://example.test/share-target'],
      ['https://other.test/ownledger/share-target'],
    ])('leaves a POST to %s alone', async (url) => {
      const { worker, emit } = fakeWorker()
      addWorkerHandlers(worker)
      const respondWith = await fetchThrough(emit, shareRequest(url))
      expect(respondWith).not.toHaveBeenCalled()
    })

    it('follows the scope it is registered in', async () => {
      const { worker, emit } = fakeWorker()
      worker.registration.scope = 'https://example.test/app/'
      addWorkerHandlers(worker)

      expect(await fetchThrough(emit, shareRequest(`${SCOPE}share-target`))).not.toHaveBeenCalled()
      const respondWith = await fetchThrough(emit, shareRequest('https://example.test/app/share-target'))
      expect((await respondWith.mock.calls[0][0]).headers.get('location')).toBe('https://example.test/app/share')
    })
  })

  describe('updating', () => {
    it('takes over when the page sends SKIP_WAITING', () => {
      const { worker, emit, skipWaiting } = fakeWorker()
      addWorkerHandlers(worker)
      emit('message', { data: { type: 'SKIP_WAITING' } } satisfies WorkerMessageEvent)
      expect(skipWaiting).toHaveBeenCalledTimes(1)
      expect(messagesOf(logs.lines)).toContain('sw: Update accepted, taking over')
    })

    it.each([[{ data: { type: 'OTHER' } }], [{ data: undefined }], [{}]])('ignores the message %j', (event) => {
      const { worker, emit, skipWaiting } = fakeWorker()
      addWorkerHandlers(worker)
      emit('message', event)
      expect(skipWaiting).not.toHaveBeenCalled()
    })
  })
})
