import { vi } from 'vitest'
import { dataChanges } from '../db/changes.ts'

/**
 * Runs a change to the data the way one arriving from somewhere else would: a
 * sync or another tab changed the database, and this screen was not told.
 * (A change made through a service on this device announces itself, and the
 * pages on screen then refresh by themselves, ADR-051.)
 */
export async function fromElsewhere<T>(change: () => Promise<T>): Promise<T> {
  const announce = vi.spyOn(dataChanges, 'announce').mockImplementation(() => {})
  try {
    return await change()
  } finally {
    announce.mockRestore()
  }
}
