import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataChanges } from '../../../db/changes.ts'
import { useSyncStore } from '../index.ts'

let stop: () => void = () => {}
afterEach(() => {
  stop()
  useSyncStore.setState({ running: false, dialogOpen: false, steps: [], dataVersion: 0 })
})

describe('useSyncStore.finish', () => {
  it('ends the run, counts a new data version, and tells the app the data may have changed', () => {
    const heard = vi.fn()
    stop = dataChanges.subscribe(heard)
    useSyncStore.getState().start('Syncing', [], { kind: 'all' })
    expect(useSyncStore.getState().running).toBe(true)
    expect(heard).not.toHaveBeenCalled()

    useSyncStore.getState().finish()

    expect(useSyncStore.getState()).toMatchObject({ running: false, dataVersion: 1 })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
