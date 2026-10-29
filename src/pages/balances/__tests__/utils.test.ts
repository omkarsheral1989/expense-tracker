import { describe, expect, it } from 'vitest'
import type { BalanceMember, GroupBalances } from '../../../services/balancesService/types.ts'
import { moneyService } from '../../../services/moneyService'
import { lineSegments, lineText, linesOf, objectName, orderedMembers, prefillOf, settlePrefillFrom, subjectName, summaryOf, summarySegments, totalsOf } from '../utils.ts'

const member = (personId: string, name: string | null, overrides: Partial<BalanceMember> = {}): BalanceMember => ({
  personId,
  email: `${personId}@gmail.com`,
  name,
  picture: null,
  isYou: false,
  ...overrides,
})
const you = member('omkar', 'Omkar Sheral', { isYou: true })
const priya = member('priya', 'Priya Shah')
const rima = member('rima', 'Rima')
const gbp = (minor: number) => moneyService.format(minor, 'GBP')
const usd = (minor: number) => moneyService.format(minor, 'USD')

const balances: GroupBalances = {
  groupId: 'g',
  members: [you, priya, rima],
  currencies: [
    {
      currency: 'GBP',
      nets: [
        { personId: 'omkar', netMinor: 1000 },
        { personId: 'priya', netMinor: 200 },
        { personId: 'rima', netMinor: -1200 },
      ],
      transfers: [
        { fromId: 'rima', toId: 'omkar', amountMinor: 1000 },
        { fromId: 'rima', toId: 'priya', amountMinor: 200 },
      ],
    },
    {
      currency: 'USD',
      nets: [
        { personId: 'omkar', netMinor: -300 },
        { personId: 'priya', netMinor: 300 },
      ],
      transfers: [{ fromId: 'omkar', toId: 'priya', amountMinor: 300 }],
    },
  ],
}

describe('naming people', () => {
  it('heads a sentence with "You" or the first name, and uses "you" or the first name inside one', () => {
    expect(subjectName(you)).toBe('You')
    expect(objectName(you)).toBe('you')
    expect(subjectName(priya)).toBe('Priya')
    expect(objectName(priya)).toBe('Priya')
  })

  it('uses the part of the email before the "@" when no name is known', () => {
    expect(subjectName(member('sam', null))).toBe('Sam')
  })
})

describe('orderedMembers', () => {
  it('puts the user first and the others A to Z by the name shown, ignoring case', () => {
    const zed = member('zed', 'zed')
    const amy = member('amy', 'Amy')

    expect(orderedMembers([zed, priya, you, amy]).map((one) => one.personId)).toEqual(['omkar', 'amy', 'priya', 'zed'])
  })

  it('does not change what it is given', () => {
    const list = [priya, you]
    orderedMembers(list)
    expect(list).toEqual([priya, you])
  })
})

describe('totalsOf and linesOf', () => {
  it('gives a person\'s net in each currency they have one, in the order of the currencies', () => {
    expect(totalsOf(balances, 'omkar')).toEqual([
      { currency: 'GBP', netMinor: 1000 },
      { currency: 'USD', netMinor: -300 },
    ])
    expect(totalsOf(balances, 'rima')).toEqual([{ currency: 'GBP', netMinor: -1200 }])
    expect(totalsOf(balances, 'nobody')).toEqual([])
  })

  it('gives the payments that involve a person from their point of view', () => {
    expect(linesOf(balances, 'omkar')).toEqual([
      { currency: 'GBP', kind: 'getsBack', otherId: 'rima', amountMinor: 1000 },
      { currency: 'USD', kind: 'owes', otherId: 'priya', amountMinor: 300 },
    ])
    expect(linesOf(balances, 'rima')).toEqual([
      { currency: 'GBP', kind: 'owes', otherId: 'omkar', amountMinor: 1000 },
      { currency: 'GBP', kind: 'owes', otherId: 'priya', amountMinor: 200 },
    ])
  })

  it('has no lines for someone who is settled up', () => {
    expect(linesOf({ ...balances, currencies: [] }, 'omkar')).toEqual([])
  })
})

describe('summaryOf', () => {
  it('says what a person gets back, in total', () => {
    expect(summaryOf(priya, [{ currency: 'GBP', netMinor: 2200 }])).toBe(`Priya gets back ${gbp(2200)} in total`)
    expect(summaryOf(you, [{ currency: 'GBP', netMinor: 2200 }])).toBe(`You get back ${gbp(2200)} in total`)
  })

  it('says what a person owes, in total', () => {
    expect(summaryOf(priya, [{ currency: 'GBP', netMinor: -1100 }])).toBe(`Priya owes ${gbp(1100)} in total`)
    expect(summaryOf(you, [{ currency: 'GBP', netMinor: -1100 }])).toBe(`You owe ${gbp(1100)} in total`)
  })

  it('says a settled-up person is settled up, with "are" for the user', () => {
    expect(summaryOf(rima, [])).toBe('Rima is settled up')
    expect(summaryOf(you, [])).toBe('You are settled up')
  })

  it('joins what is owed and what is owing in one sentence, with commas between amounts of one kind', () => {
    const totals = [
      { currency: 'GBP', netMinor: 2200 },
      { currency: 'USD', netMinor: 500 },
      { currency: 'EUR', netMinor: -1000 },
    ]

    expect(summaryOf(priya, totals)).toBe(`Priya gets back ${gbp(2200)}, ${usd(500)} and owes ${moneyService.format(1000, 'EUR')} in total`)
    expect(summaryOf(priya, [{ currency: 'GBP', netMinor: 100 }, { currency: 'USD', netMinor: 200 }])).toBe(`Priya gets back ${gbp(100)}, ${usd(200)} in total`)
  })

  it('never puts "and" between two amounts of the same kind', () => {
    const text = summaryOf(priya, [{ currency: 'GBP', netMinor: -100 }, { currency: 'USD', netMinor: -200 }])

    expect(text).toBe(`Priya owes ${gbp(100)}, ${usd(200)} in total`)
    expect(text).not.toContain(' and ')
  })
})

describe('summarySegments', () => {
  it('marks only the amounts, green for what is owed to a person and orange-red for what they owe', () => {
    const segments = summarySegments(priya, [{ currency: 'GBP', netMinor: 100 }, { currency: 'USD', netMinor: -200 }])

    expect(segments.filter((segment) => typeof segment !== 'string')).toEqual([
      { amount: gbp(100), tone: 'owed' },
      { amount: usd(200), tone: 'owes' },
    ])
    expect(segments.filter((segment) => typeof segment === 'string').join('')).toBe('Priya gets back  and owes  in total')
  })

  it('is one plain piece of text for a settled-up person', () => {
    expect(summarySegments(rima, [])).toEqual(['Rima is settled up'])
  })
})

describe('lineText', () => {
  it('reads from the point of view of the row\'s person', () => {
    const getsBack = { currency: 'GBP', kind: 'getsBack' as const, otherId: 'priya', amountMinor: 1100 }
    const owes = { currency: 'GBP', kind: 'owes' as const, otherId: 'rima', amountMinor: 100 }

    expect(lineText(you, priya, getsBack)).toBe(`You get back ${gbp(1100)} from Priya`)
    expect(lineText(rima, you, { ...owes, otherId: 'omkar' })).toBe(`Rima owes ${gbp(100)} to you`)
    expect(lineText(you, rima, owes)).toBe(`You owe ${gbp(100)} to Rima`)
    expect(lineText(priya, you, { ...getsBack, otherId: 'omkar' })).toBe(`Priya gets back ${gbp(1100)} from you`)
  })
})

describe('lineSegments', () => {
  const getsBack = { currency: 'GBP', kind: 'getsBack' as const, otherId: 'priya', amountMinor: 1100 }
  const owes = { currency: 'GBP', kind: 'owes' as const, otherId: 'rima', amountMinor: 100 }

  it('marks only the amount of a line: green when the person gets it back, orange-red when they owe it', () => {
    expect(lineSegments(you, priya, getsBack)).toEqual(['You get back ', { amount: gbp(1100), tone: 'owed' }, ' from Priya'])
    expect(lineSegments(you, rima, owes)).toEqual(['You owe ', { amount: gbp(100), tone: 'owes' }, ' to Rima'])
  })

  it('reads as the same text as lineText', () => {
    const text = lineSegments(rima, you, { ...owes, otherId: 'omkar' })
      .map((segment) => (typeof segment === 'string' ? segment : segment.amount))
      .join('')

    expect(text).toBe(lineText(rima, you, { ...owes, otherId: 'omkar' }))
  })
})

describe('prefillOf', () => {
  it('has whoever owes pay the other, whichever side the row is', () => {
    expect(prefillOf(you, { currency: 'USD', kind: 'owes', otherId: 'priya', amountMinor: 300 })).toEqual({ payerId: 'omkar', recipientId: 'priya', amountMinor: 300, currency: 'USD' })
    expect(prefillOf(you, { currency: 'GBP', kind: 'getsBack', otherId: 'rima', amountMinor: 1000 })).toEqual({ payerId: 'rima', recipientId: 'omkar', amountMinor: 1000, currency: 'GBP' })
  })
})

describe('settlePrefillFrom', () => {
  const ids = ['omkar', 'priya', 'rima']
  const good = { payerId: 'priya', recipientId: 'omkar', amountMinor: 500, currency: 'GBP' }

  it('reads a valid payment from the router state', () => {
    expect(settlePrefillFrom({ settle: good }, ids)).toEqual(good)
  })

  it('ignores anything that is not a valid payment between two members', () => {
    expect(settlePrefillFrom(null, ids)).toBeNull()
    expect(settlePrefillFrom(undefined, ids)).toBeNull()
    expect(settlePrefillFrom({}, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, payerId: 'omkar' } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, payerId: 'stranger' } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, recipientId: 'stranger' } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, amountMinor: 0 } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, amountMinor: -5 } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, amountMinor: 1.5 } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, amountMinor: '500' } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, currency: 5 } }, ids)).toBeNull()
    expect(settlePrefillFrom({ settle: { ...good, payerId: 7 } }, ids)).toBeNull()
  })
})
