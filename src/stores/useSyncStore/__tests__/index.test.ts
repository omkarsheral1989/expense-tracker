import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataChanges } from '../../../db/changes.ts'
import { useSyncStore } from '../index.ts'

let stop: () => void = () => {}
afterEach(() => {
  stop()
  useSyncStore.setState({ running: false, dialogOpen: false, steps: [], dataVersion: 0, stopRun: null, stopping: false })
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

describe('useSyncStore stopping', () => {
  it('cancels the run with requestStop, and says it is stopping', () => {
    const cancel = vi.fn()
    useSyncStore.getState().start('Syncing', [], { kind: 'all' })
    useSyncStore.getState().setStopRun(cancel)

    useSyncStore.getState().requestStop()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(useSyncStore.getState().stopping).toBe(true)
  })

  it('does nothing when no run can be stopped', () => {
    useSyncStore.getState().requestStop()
    expect(useSyncStore.getState().stopping).toBe(false)
  })

  it('forgets how to stop, and that it was stopping, when the run ends', () => {
    useSyncStore.getState().start('Syncing', [], { kind: 'all' })
    useSyncStore.getState().setStopRun(() => {})
    useSyncStore.getState().requestStop()

    useSyncStore.getState().finish()

    expect(useSyncStore.getState()).toMatchObject({ stopRun: null, stopping: false })
  })

  it('starts the next run not stopping', () => {
    useSyncStore.setState({ stopping: true })
    useSyncStore.getState().start('Syncing', [], { kind: 'all' })
    expect(useSyncStore.getState().stopping).toBe(false)
  })
})
