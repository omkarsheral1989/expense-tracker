import { describe, expect, it } from 'vitest'
import { CATEGORY_GROUPS, DEFAULT_CATEGORY } from '../constants.ts'
import { CATEGORIES, categoryOf, debtsOf, isCategoryKey, pairBalances, splitEqually } from '../utils.ts'

/** The shares as [person, paid, owed, input] for easy reading. */
function table(shares: ReturnType<typeof splitEqually>) {
  return shares.map((share) => [share.personId, share.paidMinor, share.owedMinor, share.inputValue])
}

describe('splitEqually', () => {
  it('divides an even amount equally, with the payer paying it all', () => {
    expect(table(splitEqually(900, ['me', 'priya', 'sam'], 'me'))).toEqual([
      ['me', 900, 300, 1],
      ['priya', 0, 300, 1],
      ['sam', 0, 300, 1],
    ])
  })

  it('gives the minor units left over to the payer', () => {
    expect(table(splitEqually(1000, ['priya', 'me', 'sam'], 'me'))).toEqual([
      ['priya', 0, 333, 1],
      ['me', 1000, 334, 1],
      ['sam', 0, 333, 1],
    ])
    expect(table(splitEqually(1001, ['me', 'priya', 'sam'], 'me'))).toEqual([
      ['me', 1001, 335, 1],
      ['priya', 0, 333, 1],
      ['sam', 0, 333, 1],
    ])
  })

  it('gives the left over to a payer who is not in the split', () => {
    expect(table(splitEqually(1000, ['priya', 'sam', 'ana'], 'me'))).toEqual([
      ['priya', 0, 333, 1],
      ['sam', 0, 333, 1],
      ['ana', 0, 333, 1],
      ['me', 1000, 1, 0],
    ])
  })

  it('always adds up to the amount', () => {
    for (const amount of [1, 2, 7, 99, 100, 101, 12345, 100_000_000_000]) {
      for (const people of [['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]) {
        const shares = splitEqually(amount, people, 'a')
        expect(shares.reduce((sum, share) => sum + share.owedMinor, 0)).toBe(amount)
        expect(shares.reduce((sum, share) => sum + share.paidMinor, 0)).toBe(amount)
      }
    }
  })

  it('gives everything to a single person', () => {
    expect(table(splitEqually(1234, ['me'], 'me'))).toEqual([['me', 1234, 1234, 1]])
  })

  it('refuses to split between nobody', () => {
    expect(() => splitEqually(100, [], 'me')).toThrow()
  })
})

describe('categories', () => {
  it('has unique keys, each starting with its group (except the default)', () => {
    const keys = CATEGORIES.map((category) => category.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const category of CATEGORIES) {
      if (category.key === DEFAULT_CATEGORY) continue
      expect(category.key.startsWith(`${category.group}.`)).toBe(true)
    }
  })

  it('lists the groups in order, about 45 categories in all', () => {
    expect(CATEGORY_GROUPS.map((group) => group.label)).toEqual([
      'Entertainment',
      'Food and drink',
      'Home',
      'Life',
      'Transportation',
      'Uncategorized',
      'Utilities',
    ])
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(40)
    expect(CATEGORIES.length).toBeLessThanOrEqual(50)
  })

  it('has "General" as the default, in Uncategorized', () => {
    expect(categoryOf(DEFAULT_CATEGORY)).toEqual({
      key: 'general',
      label: 'General',
      group: 'uncategorized',
      groupLabel: 'Uncategorized',
    })
  })

  it('finds a category by key, and shows an unknown key as the default', () => {
    expect(categoryOf('food.dining_out').label).toBe('Dining out')
    expect(categoryOf('food.future_thing').key).toBe(DEFAULT_CATEGORY)
    expect(isCategoryKey('food.dining_out')).toBe(true)
    expect(isCategoryKey('food.future_thing')).toBe(false)
  })
})

describe('debtsOf', () => {
  it('makes everyone else owe the one payer their share', () => {
    expect(
      debtsOf([
        { personId: 'me', paidMinor: 1000, owedMinor: 334 },
        { personId: 'priya', paidMinor: 0, owedMinor: 333 },
        { personId: 'sam', paidMinor: 0, owedMinor: 333 },
      ]),
    ).toEqual([
      { from: 'priya', to: 'me', amountMinor: 333 },
      { from: 'sam', to: 'me', amountMinor: 333 },
    ])
  })

  it('has no debts when the payer owes it all', () => {
    expect(debtsOf([{ personId: 'me', paidMinor: 500, owedMinor: 500 }])).toEqual([])
  })

  it('makes the people in the split owe a payer who is not in it', () => {
    expect(
      debtsOf([
        { personId: 'priya', paidMinor: 0, owedMinor: 500 },
        { personId: 'me', paidMinor: 1000, owedMinor: 0 },
        { personId: 'sam', paidMinor: 0, owedMinor: 500 },
      ]),
    ).toEqual([
      { from: 'priya', to: 'me', amountMinor: 500 },
      { from: 'sam', to: 'me', amountMinor: 500 },
    ])
  })

  it('matches those who are short with those ahead when several paid', () => {
    expect(
      debtsOf([
        { personId: 'a', paidMinor: 600, owedMinor: 300 },
        { personId: 'b', paidMinor: 300, owedMinor: 300 },
        { personId: 'c', paidMinor: 0, owedMinor: 300 },
      ]),
    ).toEqual([{ from: 'c', to: 'a', amountMinor: 300 }])
  })
})

describe('pairBalances', () => {
  const lunch = (payer: string, amount: number, people: string[], currency = 'GBP') => ({
    currency,
    shares: splitEqually(amount, people, payer),
  })

  it('adds up what each person owes the user and what the user owes them', () => {
    expect(
      pairBalances('me', [
        lunch('me', 900, ['me', 'priya', 'sam']),
        lunch('priya', 600, ['me', 'priya']),
      ]),
    ).toEqual([
      // Priya owes 300, the user owes her 300 back: settled, so left out.
      { personId: 'sam', currency: 'GBP', amountMinor: 300 },
    ])
  })

  it('keeps currencies apart, with no conversion', () => {
    expect(
      pairBalances('me', [lunch('me', 1000, ['me', 'priya']), lunch('priya', 3000, ['me', 'priya'], 'INR')]),
    ).toEqual([
      { personId: 'priya', currency: 'GBP', amountMinor: 500 },
      { personId: 'priya', currency: 'INR', amountMinor: -1500 },
    ])
  })

  it('ignores debts between two other people', () => {
    expect(pairBalances('me', [lunch('priya', 1000, ['priya', 'sam'])])).toEqual([])
  })
})
