import { describe, expect, it } from 'vitest'
import { isOutOfSpace, photoFileName, runPool } from '../utils.ts'

describe('photoFileName', () => {
  it('names a photo by its id with the extension of its type', () => {
    expect(photoFileName('abc', 'image/jpeg')).toBe('abc.jpg')
    expect(photoFileName('abc', 'image/png')).toBe('abc.png')
    expect(photoFileName('abc', 'image/heic')).toBe('abc.heic')
  })

  it('uses the end of an unusual type, keeping only letters and digits', () => {
    expect(photoFileName('abc', 'image/svg+xml')).toBe('abc.svgxml')
    expect(photoFileName('abc', 'image/')).toBe('abc.img')
  })
})

describe('isOutOfSpace', () => {
  it('knows a full device by the error\'s name or message', () => {
    expect(isOutOfSpace(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isOutOfSpace(new Error('The quota has been exceeded.'))).toBe(true)
    expect(isOutOfSpace(new Error('Network error'))).toBe(false)
    expect(isOutOfSpace('quota')).toBe(false)
  })

  it('knows it also from an exception that is not an Error, as some browsers report it', () => {
    expect(isOutOfSpace({ name: 'QuotaExceededError', message: '' })).toBe(true)
    expect(isOutOfSpace(null)).toBe(false)
  })
})

describe('runPool', () => {
  it('runs every item, no more than `limit` at a time', async () => {
    let running = 0
    let most = 0
    const done: number[] = []

    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running++
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      done.push(item)
    })

    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(most).toBe(3)
  })

  it('starts no new item after one throws, and throws that error', async () => {
    const started: number[] = []

    const run = runPool([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item)
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (item === 1) throw new Error('stop')
    })

    await expect(run).rejects.toThrow('stop')
    expect(started.length).toBeLessThanOrEqual(3)
  })

  it('does nothing for no items', async () => {
    await expect(runPool([], 3, async () => { throw new Error('never') })).resolves.toBeUndefined()
  })
})
