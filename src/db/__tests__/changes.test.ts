import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataChanges, notifyAfter } from '../changes.ts'

const heard = vi.fn()
let stop: () => void = () => {}

afterEach(() => {
  stop()
  heard.mockReset()
})

describe('dataChanges', () => {
  it('tells every listener when the data changed, until one stops', () => {
    const other = vi.fn()
    stop = dataChanges.subscribe(heard)
    const stopOther = dataChanges.subscribe(other)

    dataChanges.announce()
    expect([heard.mock.calls.length, other.mock.calls.length]).toEqual([1, 1])

    stopOther()
    dataChanges.announce()
    expect([heard.mock.calls.length, other.mock.calls.length]).toEqual([2, 1])
  })
})

describe('notifyAfter', () => {
  const service = {
    works: async () => ({ ok: true as const }),
    refused: async () => ({ ok: false as const, notFound: true as const }),
    plain: async () => 'value',
    fails: async (): Promise<{ ok: true }> => {
      throw new Error('boom')
    },
    reads: async () => ({ ok: true as const }),
  }
  const wrapped = notifyAfter(service, ['works', 'refused', 'plain', 'fails'])

  it('announces a change once a listed call has worked, and returns its result unchanged', async () => {
    stop = dataChanges.subscribe(heard)
    expect(await wrapped.works()).toEqual({ ok: true })
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('announces after a result that has no ok at all', async () => {
    stop = dataChanges.subscribe(heard)
    expect(await wrapped.plain()).toBe('value')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('announces nothing when the call was refused', async () => {
    stop = dataChanges.subscribe(heard)
    expect(await wrapped.refused()).toEqual({ ok: false, notFound: true })
    expect(heard).not.toHaveBeenCalled()
  })

  it('announces nothing, and throws again, when the call failed', async () => {
    stop = dataChanges.subscribe(heard)
    await expect(wrapped.fails()).rejects.toThrow('boom')
    expect(heard).not.toHaveBeenCalled()
  })

  it('leaves the functions that are not listed alone', async () => {
    stop = dataChanges.subscribe(heard)
    expect(wrapped.reads).toBe(service.reads)
    await wrapped.reads()
    expect(heard).not.toHaveBeenCalled()
  })

  it('announces after the call is done, not before', async () => {
    const order: string[] = []
    stop = dataChanges.subscribe(() => order.push('announced'))
    const slow = notifyAfter({ write: async () => void order.push('written') }, ['write'])
    await slow.write()
    expect(order).toEqual(['written', 'announced'])
  })
})
