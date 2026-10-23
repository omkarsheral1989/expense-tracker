// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logService, type LogEntry } from '../index.ts'
import { DEBUG_STORAGE_KEY } from '../constants.ts'

let lines: LogEntry[]

beforeEach(() => {
  lines = []
  logService.setOutput((entry) => lines.push(entry))
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  logService.setOutput(() => {})
  vi.restoreAllMocks()
})

describe('logService.scope', () => {
  it('writes each level with its scope, message and cleaned fields', () => {
    const log = logService.scope('sync')
    log.info('Started', { groups: 2, email: 'a@gmail.com' })
    log.warn('Slow')
    log.error('Failed', { status: 500 })

    expect(lines).toEqual([
      { level: 'info', scope: 'sync', message: 'Started', fields: { groups: 2 } },
      { level: 'warn', scope: 'sync', message: 'Slow', fields: {} },
      { level: 'error', scope: 'sync', message: 'Failed', fields: { status: 500 } },
    ])
  })

  it('hides debug lines until the flag is on', () => {
    const log = logService.scope('db')
    log.debug('Hidden')
    expect(lines).toHaveLength(0)

    localStorage.setItem(DEBUG_STORAGE_KEY, '1')
    log.debug('Shown')
    expect(lines.map((line) => line.message)).toEqual(['Shown'])
  })

  it('turns debug on for one visit with ?debug=1', () => {
    const log = logService.scope('db')
    window.history.replaceState(null, '', '/?debug=1')
    log.debug('Shown')
    expect(lines).toHaveLength(1)
  })

  it('does not treat other flag values as on', () => {
    localStorage.setItem(DEBUG_STORAGE_KEY, 'true')
    window.history.replaceState(null, '', '/?debug=yes')
    logService.scope('db').debug('Hidden')
    expect(lines).toHaveLength(0)
  })

  it('still logs when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const log = logService.scope('db')
    log.info('Fine')
    log.debug('Hidden')
    expect(lines.map((line) => line.message)).toEqual(['Fine'])
  })
})

describe('the console output', () => {
  it('prefixes the line with the app and scope and prints fields as an object', () => {
    logService.setOutput(null)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = logService.scope('db')

    log.info('Opened', { migrations: 11 })
    log.error('Failed')

    expect(info).toHaveBeenCalledWith('[ownledger:db] Opened', { migrations: 11 })
    expect(error).toHaveBeenCalledWith('[ownledger:db] Failed')
  })

})

describe('logService.watchGlobalErrors', () => {
  it('logs uncaught errors and rejected promises, and stops when asked', () => {
    const target = new EventTarget()
    const stop = logService.watchGlobalErrors(target)

    target.dispatchEvent(Object.assign(new Event('error'), { error: new TypeError('bad'), message: 'bad' }))
    const rejection = new Event('unhandledrejection')
    Object.assign(rejection, { reason: new Error('nope') })
    target.dispatchEvent(rejection)

    expect(lines.map((line) => [line.level, line.scope, line.message, line.fields.reason])).toEqual([
      ['error', 'app', 'Uncaught error', 'bad'],
      ['error', 'app', 'Unhandled promise rejection', 'nope'],
    ])

    stop()
    target.dispatchEvent(Object.assign(new Event('error'), { error: new Error('later') }))
    expect(lines).toHaveLength(2)
  })
})

describe('logService.logActions', () => {
  const ID = '3f2a6c1e-8b7d-4e5f-9a10-b2c3d4e5f607'
  const service = {
    ok: async () => ({ ok: true as const, id: ID }),
    gone: async () => ({ ok: false as const, notFound: true as const }),
    invalid: async () => ({ ok: false as const, errors: { name: 'Required', currency: 'Bad' } }),
    boom: async () => {
      throw Object.assign(new Error('Database is closed'), { name: 'DbError' })
    },
    untouched: async () => 'x',
  }
  const wrapped = logService.logActions(logService.scope('svc'), service, {
    ok: { message: 'Done', params: ['userId', 'groupId'] },
    gone: { message: 'Looked', params: ['userId'] },
    invalid: { message: 'Saved' },
    boom: { message: 'Broke' },
  })

  it('logs a call that worked at info with its ids and returns the result unchanged', async () => {
    const result = await (wrapped.ok as (...args: unknown[]) => Promise<unknown>)({}, ID, 'not-an-id')
    expect(result).toEqual({ ok: true, id: ID })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 'info', scope: 'svc', message: 'Done' })
    expect(lines[0].fields).toMatchObject({ userId: ID, ok: true })
    expect(lines[0].fields).not.toHaveProperty('groupId')
    expect(typeof lines[0].fields.ms).toBe('number')
  })

  it('logs a refusal at warn with what refused it', async () => {
    await (wrapped.gone as (...args: unknown[]) => Promise<unknown>)({}, ID)
    expect(lines[0]).toMatchObject({ level: 'warn', message: 'Looked: refused' })
    expect(lines[0].fields).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  it('counts field errors without printing them', async () => {
    await (wrapped.invalid as (...args: unknown[]) => Promise<unknown>)({})
    expect(lines[0].fields).toMatchObject({ ok: false, fieldErrors: 2 })
    expect(JSON.stringify(lines[0])).not.toContain('Required')
  })

  it('logs a throw at error and throws it again', async () => {
    await expect((wrapped.boom as (...args: unknown[]) => Promise<unknown>)({})).rejects.toThrow('Database is closed')
    expect(lines[0]).toMatchObject({ level: 'error', message: 'Broke: failed' })
    expect(lines[0].fields).toMatchObject({ error: 'DbError', reason: 'Database is closed' })
  })

  it('leaves functions that are not listed alone', async () => {
    expect(wrapped.untouched).toBe(service.untouched)
    await wrapped.untouched()
    expect(lines).toHaveLength(0)
  })
})
