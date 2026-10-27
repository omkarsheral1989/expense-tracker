import { describe, expect, it } from 'vitest'
import { MEMBER_COLORS } from '../../../theme/memberColors.ts'
import type { TotalsRow } from '../../../services/totalsService/types.ts'
import { colorsOf, rowName, totalsKey } from '../utils.ts'

const row = (personId: string, name: string | null, overrides: Partial<TotalsRow> = {}): TotalsRow => ({
  personId,
  name,
  email: null,
  picture: null,
  isYou: false,
  amountMinor: 0,
  ...overrides,
})

describe('rowName', () => {
  it('says You for the user, the first name for others, and the start of the email without a name', () => {
    expect(rowName(row('a', 'Omkar Sheral', { isYou: true }))).toBe('You')
    expect(rowName(row('b', 'Priya Shah'))).toBe('Priya')
    expect(rowName(row('c', null, { email: 'sam.k@gmail.com' }))).toBe('Sam.k')
    expect(rowName(row('d', null))).toBe('Someone')
  })
})

describe('colorsOf', () => {
  it('gives the colors out in order: the user first, then the others A to Z', () => {
    const colors = colorsOf([row('z', 'Zed'), row('m', 'Me', { isYou: true }), row('b', 'bob'), row('a', 'Amy')])

    expect(colors.get('m')).toBe(MEMBER_COLORS[0])
    expect(colors.get('a')).toBe(MEMBER_COLORS[1])
    expect(colors.get('b')).toBe(MEMBER_COLORS[2])
    expect(colors.get('z')).toBe(MEMBER_COLORS[3])
  })

  it('does not depend on the order of the rows, so both donuts give a member the same color', () => {
    const shares = [row('a', 'Amy'), row('b', 'Bob'), row('m', 'Me', { isYou: true })]
    const paid = [row('b', 'Bob'), row('m', 'Me', { isYou: true }), row('a', 'Amy')]

    expect(colorsOf(paid)).toEqual(colorsOf(shares))
  })

  it('uses the name shown, and the id to tell two of one name apart', () => {
    const colors = colorsOf([row('2', 'Sam'), row('1', 'Sam')])

    expect(colors.get('1')).toBe(MEMBER_COLORS[0])
    expect(colors.get('2')).toBe(MEMBER_COLORS[1])
  })

  it('starts the colors over for a group bigger than the palette', () => {
    const many = Array.from({ length: MEMBER_COLORS.length + 2 }, (_, index) => row(`p${String(index).padStart(2, '0')}`, `Person ${String(index).padStart(2, '0')}`))

    const colors = colorsOf(many)

    expect(colors.get(`p${String(MEMBER_COLORS.length).padStart(2, '0')}`)).toBe(MEMBER_COLORS[0])
  })
})

describe('totalsKey', () => {
  it('is one key for one user and group', () => {
    expect(totalsKey('u', 'g')).toBe('u:g')
    expect(totalsKey('u', 'g')).not.toBe(totalsKey('v', 'g'))
  })
})
