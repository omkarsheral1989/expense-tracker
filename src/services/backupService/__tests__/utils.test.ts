import { describe, expect, it } from 'vitest'
import { isNewer, renameIds } from '../utils.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('isNewer', () => {
  const at = (minute: number, updatedBy: string) => ({ updatedAt: new Date(2026, 9, 21, 10, minute), updatedBy })

  it('takes the version changed later', () => {
    expect(isNewer(at(5, A), at(4, B))).toBe(true)
    expect(isNewer(at(4, B), at(5, A))).toBe(false)
  })

  it('breaks a tie by the larger person id, so every device picks the same one', () => {
    expect(isNewer(at(5, B), at(5, A))).toBe(true)
    expect(isNewer(at(5, A), at(5, B))).toBe(false)
  })

  it('does not count the same version as newer', () => {
    expect(isNewer(at(5, A), at(5, A))).toBe(false)
  })
})

describe('renameIds', () => {
  it('replaces an id everywhere it occurs, also deep inside', () => {
    const data = { personId: A, updatedBy: A, snapshot: { shares: [{ personId: A }, { personId: B }] } }

    expect(renameIds(data, new Map([[A, B]]))).toEqual({
      personId: B,
      updatedBy: B,
      snapshot: { shares: [{ personId: B }, { personId: B }] },
    })
  })

  it('writes dates as text, to be parsed again', () => {
    expect(renameIds({ at: new Date('2026-10-21T10:00:00.000Z') }, new Map())).toEqual({ at: '2026-10-21T10:00:00.000Z' })
  })
})
