import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SHARE_MAX_AGE_MS, sharedFiles, type SharedItems } from '../sharedFiles.ts'

function items(overrides: Partial<SharedItems> = {}): SharedItems {
  return {
    pictures: [{ name: 'a.png', type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer }],
    notes: 'Dinner',
    leftOut: 0,
    sharedAt: 1_000,
    ...overrides,
  }
}

describe('sharedFiles', () => {
  beforeEach(async () => {
    await sharedFiles.clear()
  })

  it('is empty until something is shared', async () => {
    expect(await sharedFiles.read(1_000)).toBeNull()
  })

  it('gives back what was saved, bytes included', async () => {
    await sharedFiles.save(items())
    const read = await sharedFiles.read(1_000)
    expect(read?.notes).toBe('Dinner')
    expect(read?.pictures[0].name).toBe('a.png')
    expect([...new Uint8Array(read!.pictures[0].bytes)]).toEqual([1, 2, 3])
  })

  it('keeps only the latest share', async () => {
    await sharedFiles.save(items({ notes: 'first' }))
    await sharedFiles.save(items({ notes: 'second', pictures: [] }))
    const read = await sharedFiles.read(1_000)
    expect(read?.notes).toBe('second')
    expect(read?.pictures).toHaveLength(0)
  })

  it('is empty once cleared', async () => {
    await sharedFiles.save(items())
    await sharedFiles.clear()
    expect(await sharedFiles.read(1_000)).toBeNull()
  })

  it('ignores and removes a share older than an hour, but not one just inside it', async () => {
    await sharedFiles.save(items({ sharedAt: 1_000 }))
    expect(await sharedFiles.read(1_000 + SHARE_MAX_AGE_MS)).not.toBeNull()
    expect(await sharedFiles.read(1_000 + SHARE_MAX_AGE_MS + 1)).toBeNull()
    // Removed, not only hidden: it is gone for a reader with an earlier clock too.
    expect(await sharedFiles.read(1_000)).toBeNull()
  })
})
