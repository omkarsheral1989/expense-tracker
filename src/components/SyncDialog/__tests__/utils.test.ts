import { describe, expect, it } from 'vitest'
import type { SyncStep } from '../../../stores/useSyncStore/types.ts'
import { EMPTY_ORDER, nextOrder, sameOrder } from '../utils.ts'

const line = (key: string, status: SyncStep['status']): SyncStep => ({ key, label: key, status, detail: '' })

describe('nextOrder', () => {
  it('keeps the lines in their own order while only the backup is working', () => {
    const order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'waiting'), line('b', 'waiting')])

    expect(order.keys).toEqual(['backup', 'a', 'b'])
    expect(order.promoted).toEqual([])
  })

  it('puts the lines that are working right under the first, the rest after them in their own order', () => {
    const order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'done'), line('b', 'waiting'), line('c', 'running')])

    expect(order.keys).toEqual(['backup', 'c', 'a', 'b'])
  })

  it('never moves the first line, even when it is the one working', () => {
    const order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'running')])

    expect(order.keys[0]).toBe('backup')
  })

  it('remembers which lines have been seen working, once each', () => {
    let order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'running'), line('b', 'waiting')])
    expect(order.promoted).toEqual(['a'])

    order = nextOrder(order, [line('backup', 'running'), line('a', 'running'), line('b', 'running')])
    expect(order.promoted).toEqual(['a', 'b'])

    order = nextOrder(order, [line('backup', 'running'), line('a', 'done'), line('b', 'running')])
    expect(order.promoted).toEqual(['a', 'b'])
  })

  it('keeps the order when nothing is working any more', () => {
    let order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'done'), line('b', 'running')])
    order = nextOrder(order, [line('backup', 'done'), line('a', 'done'), line('b', 'done')])

    expect(order.keys).toEqual(['backup', 'b', 'a'])
  })

  it('adds a line that is new at the end when nothing is working', () => {
    let order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'done'), line('b', 'running')])
    order = nextOrder(order, [line('backup', 'done'), line('a', 'done'), line('b', 'done'), line('c', 'done')])

    expect(order.keys).toEqual(['backup', 'b', 'a', 'c'])
  })

  it('forgets lines that are gone', () => {
    let order = nextOrder(EMPTY_ORDER, [line('backup', 'running'), line('a', 'done'), line('b', 'running')])
    order = nextOrder(order, [line('backup', 'running'), line('a', 'waiting')])

    expect(order).toEqual({ keys: ['backup', 'a'], promoted: [] })
  })
})

describe('sameOrder', () => {
  it('is true for the same keys and promoted lines, and false when either differs', () => {
    expect(sameOrder({ keys: ['a', 'b'], promoted: ['b'] }, { keys: ['a', 'b'], promoted: ['b'] })).toBe(true)
    expect(sameOrder({ keys: ['a', 'b'], promoted: [] }, { keys: ['b', 'a'], promoted: [] })).toBe(false)
    expect(sameOrder({ keys: ['a', 'b'], promoted: [] }, { keys: ['a', 'b'], promoted: ['b'] })).toBe(false)
  })
})
