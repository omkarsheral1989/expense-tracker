import { describe, expect, it } from 'vitest'
import { CATEGORY_GROUPS, DEFAULT_CATEGORY, SETTLEMENT_CATEGORY } from '../constants.ts'
import type { ExpenseSnapshot, SplitMethod } from '../../../db/types.ts'
import { expenseService } from '../index.ts'
import { CATEGORIES, categoryOf, computeShares, debtsOf, expenseChanges, isCategoryKey, pairBalances, payerOf, sameSnapshot, sameSplitInput, settlementSentence, SPLIT_DOES_NOT_ADD_UP, titleOf } from '../utils.ts'

const MEMBERS = ['me', 'priya', 'sam']

/** Works out a split of the members above, failing the test if it is refused. */
function shares(amountMinor: number, method: SplitMethod, values: Record<string, number>, payer = 'me', members = MEMBERS) {
  const result = computeShares(amountMinor, { method, values }, payer, members)
  if (!result.ok) throw new Error(result.message)
  return result.shares
}

/** The shares as [person, paid, owed, input] for easy reading. */
function table(list: { personId: string; paidMinor: number; owedMinor: number; inputValue: number | null }[]) {
  return list.map((share) => [share.personId, share.paidMinor, share.owedMinor, share.inputValue])
}

/** Why a split is refused, or 'ok'. */
function problem(amountMinor: number, method: SplitMethod, values: Record<string, number>, payer = 'me') {
  const result = computeShares(amountMinor, { method, values }, payer, MEMBERS)
  return result.ok ? 'ok' : result.message
}

const everyone = { me: 1, priya: 1, sam: 1 }

describe('computeShares', () => {
  describe('equally', () => {
    it('divides an even amount equally, with the payer paying it all', () => {
      expect(table(shares(900, 'equal', everyone))).toEqual([
        ['me', 900, 300, 1],
        ['priya', 0, 300, 1],
        ['sam', 0, 300, 1],
      ])
    })

    it('gives the minor units left over to the payer', () => {
      expect(table(shares(1000, 'equal', everyone, 'priya'))).toEqual([
        ['me', 0, 333, 1],
        ['priya', 1000, 334, 1],
        ['sam', 0, 333, 1],
      ])
    })

    it('gives the left over to a payer who is not in the split, and keeps every member', () => {
      expect(table(shares(1000, 'equal', { priya: 1, sam: 1, me: 0 }, 'me'))).toEqual([
        ['me', 1000, 0, 0],
        ['priya', 0, 500, 1],
        ['sam', 0, 500, 1],
      ])
      expect(table(shares(1001, 'equal', { priya: 1, sam: 1 }, 'me'))).toEqual([
        ['me', 1001, 1, 0],
        ['priya', 0, 500, 1],
        ['sam', 0, 500, 1],
      ])
    })

    it('needs at least one person', () => {
      expect(problem(1000, 'equal', {})).toBe('Choose at least one person.')
      expect(problem(1000, 'equal', { me: 2 })).toBe(SPLIT_DOES_NOT_ADD_UP)
    })
  })

  describe('by exact amounts', () => {
    it('uses the amounts as they are', () => {
      expect(table(shares(1000, 'exact', { me: 200, priya: 800 }, 'priya'))).toEqual([
        ['me', 0, 200, 200],
        ['priya', 1000, 800, 800],
        ['sam', 0, 0, 0],
      ])
    })

    it('must add up to the amount exactly', () => {
      expect(problem(1000, 'exact', { me: 200, priya: 700 })).toBe(SPLIT_DOES_NOT_ADD_UP)
      expect(problem(1000, 'exact', { me: 200, priya: 900 })).toBe(SPLIT_DOES_NOT_ADD_UP)
    })
  })

  describe('by percentages', () => {
    it('divides by whole percentages, the payer taking what is left over', () => {
      expect(table(shares(1001, 'percent', { me: 50, priya: 25, sam: 25 }, 'priya'))).toEqual([
        ['me', 0, 500, 50],
        ['priya', 1001, 251, 25],
        ['sam', 0, 250, 25],
      ])
    })

    it('must come to 100%', () => {
      expect(problem(1000, 'percent', { me: 50, priya: 49 })).toBe(SPLIT_DOES_NOT_ADD_UP)
      expect(problem(1000, 'percent', { me: 50, priya: 51 })).toBe(SPLIT_DOES_NOT_ADD_UP)
      expect(problem(1000, 'percent', { me: 100 })).toBe('ok')
    })
  })

  describe('by shares', () => {
    it('divides in proportion to the shares', () => {
      expect(table(shares(1000, 'shares', { me: 2, priya: 1, sam: 1 }))).toEqual([
        ['me', 1000, 500, 2],
        ['priya', 0, 250, 1],
        ['sam', 0, 250, 1],
      ])
      expect(table(shares(1000, 'shares', { me: 1, priya: 2 }))).toEqual([
        ['me', 1000, 334, 1],
        ['priya', 0, 666, 2],
        ['sam', 0, 0, 0],
      ])
    })

    it('needs at least one share, and at most 1000 each', () => {
      expect(problem(1000, 'shares', { me: 0 })).toBe('Give at least one share.')
      expect(problem(1000, 'shares', { me: 1001 })).toBe('Use at most 1000 shares each.')
      expect(problem(1000, 'shares', { me: 1000 })).toBe('ok')
    })
  })

  describe('by adjustment', () => {
    it('adds each person\'s extra to an equal part of what remains', () => {
      // 10.00 with 1.00 extra for Priya: 9.00 split three ways, plus Priya's 1.00.
      expect(table(shares(1000, 'adjustment', { priya: 100 }))).toEqual([
        ['me', 1000, 300, 0],
        ['priya', 0, 400, 100],
        ['sam', 0, 300, 0],
      ])
      expect(table(shares(1000, 'adjustment', {}))).toEqual([
        ['me', 1000, 334, 0],
        ['priya', 0, 333, 0],
        ['sam', 0, 333, 0],
      ])
    })

    it('allows extras up to the whole amount, and no more', () => {
      expect(problem(1000, 'adjustment', { priya: 600, sam: 400 })).toBe('ok')
      expect(problem(1000, 'adjustment', { priya: 600, sam: 401 })).toBe(SPLIT_DOES_NOT_ADD_UP)
    })
  })

  it('always adds up to the amount', () => {
    const splits: [SplitMethod, Record<string, number>][] = [
      ['equal', { me: 1, sam: 1 }],
      ['percent', { me: 33, priya: 33, sam: 34 }],
      ['shares', { me: 3, priya: 7, sam: 11 }],
      ['adjustment', { priya: 1 }],
    ]
    for (const amount of [1, 2, 7, 99, 100, 101, 12345, 100_000_000_000]) {
      for (const [method, values] of splits) {
        for (const payer of MEMBERS) {
          const list = shares(amount, method, values, payer)
          expect(list.reduce((sum, share) => sum + share.owedMinor, 0)).toBe(amount)
          expect(list.reduce((sum, share) => sum + share.paidMinor, 0)).toBe(amount)
          expect(list.every((share) => share.owedMinor >= 0)).toBe(true)
        }
      }
    }
  })

  it('refuses a payer or a person who is not a member, and numbers that are not whole', () => {
    expect(problem(1000, 'equal', everyone, 'stranger')).toBe('Choose who paid.')
    expect(problem(1000, 'equal', { ...everyone, stranger: 1 })).toBe('Only members of the group can be in the split.')
    expect(problem(1000, 'exact', { me: 500.5, priya: 499.5 })).toBe('Use whole numbers of 0 or more.')
    expect(problem(1000, 'exact', { me: 1100, priya: -100 })).toBe('Use whole numbers of 0 or more.')
  })
})

describe('categories', () => {
  it('has unique keys, each starting with its group (except the default)', () => {
    const keys = CATEGORIES.map((category) => category.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const category of CATEGORIES) {
      if (category.key === DEFAULT_CATEGORY || category.key === SETTLEMENT_CATEGORY) continue
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
      // Only given to a payment between two members; the picker leaves it out.
      'Settlement',
    ])
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(40)
    expect(CATEGORIES.length).toBeLessThanOrEqual(50)
  })

  it('keeps the settlement category out of the picker\'s groups but knows it', () => {
    expect(expenseService.categoryGroups.map((group) => group.label)).not.toContain('Settlement')
    expect(expenseService.categoryGroups.flatMap((group) => group.categories.map((category) => category.key))).not.toContain(SETTLEMENT_CATEGORY)
    expect(isCategoryKey(SETTLEMENT_CATEGORY)).toBe(true)
    expect(categoryOf(SETTLEMENT_CATEGORY)).toEqual({
      key: 'settlement',
      label: 'Settlement',
      group: 'settlement',
      groupLabel: 'Settlement',
    })
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
    shares: shares(amount, 'equal', Object.fromEntries(people.map((person) => [person, 1])), payer, people),
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

describe('settlementSentence', () => {
  const you = { isYou: true, name: 'Omkar', email: 'omkar@gmail.com' }
  const priya = { isYou: false, name: 'Priya Shah', email: 'priya@gmail.com' }
  const sam = { isYou: false, name: null, email: 'sam@gmail.com' }

  it('says "You paid Priya" when you paid, naming people by first name', () => {
    expect(settlementSentence(you, priya)).toBe('You paid Priya')
  })

  it('says "Priya paid you" when you received it', () => {
    expect(settlementSentence(priya, you)).toBe('Priya paid you')
  })

  it('names both when neither is you, using the email\'s name when there is no name', () => {
    expect(settlementSentence(priya, sam)).toBe('Priya paid Sam')
    expect(settlementSentence(sam, priya)).toBe('Sam paid Priya')
  })
})

describe('titleOf', () => {
  const shares = [
    { personId: 'a', email: 'omkar@gmail.com', name: 'Omkar', isYou: true, paidMinor: 500, owedMinor: 0 },
    { personId: 'b', email: 'priya@gmail.com', name: 'Priya', isYou: false, paidMinor: 0, owedMinor: 500 },
  ]

  it('is the description of an ordinary expense', () => {
    expect(titleOf({ category: 'food.dining_out', description: 'Dinner', shares })).toBe('Dinner')
  })

  it('is who paid whom for a settlement', () => {
    expect(titleOf({ category: SETTLEMENT_CATEGORY, description: 'Payment', shares })).toBe('You paid Priya')
  })

  it('falls back to the description for a settlement without a payer and a recipient', () => {
    expect(titleOf({ category: SETTLEMENT_CATEGORY, description: 'Payment', shares: [shares[0]] })).toBe('Payment')
    expect(titleOf({ category: SETTLEMENT_CATEGORY, description: 'Payment', shares: [] })).toBe('Payment')
  })
})

const SNAPSHOT: ExpenseSnapshot = {
  description: 'Dinner',
  category: 'food.dining_out',
  amountMinor: 1000,
  currency: 'INR',
  date: '2026-10-08',
  notes: null,
  method: 'equal',
  shares: [
    { personId: 'me', paidMinor: 1000, owedMinor: 500, inputValue: 1 },
    { personId: 'priya', paidMinor: 0, owedMinor: 500, inputValue: 1 },
  ],
  photos: [{ id: 'a', position: 0, mimeType: 'image/jpeg', sizeBytes: 5 }],
}

describe('payerOf', () => {
  it('is the person who paid, or null when no share records a payment', () => {
    expect(payerOf(SNAPSHOT)).toBe('me')
    expect(payerOf({ ...SNAPSHOT, shares: [{ personId: 'priya', paidMinor: 0, owedMinor: 0, inputValue: null }] })).toBeNull()
  })
})

describe('sameSplitInput', () => {
  it('is true for the same payer, method and numbers, whatever the amounts came to', () => {
    const rounded = { ...SNAPSHOT, shares: SNAPSHOT.shares.map((share) => ({ ...share, owedMinor: 1 })) }
    expect(sameSplitInput(SNAPSHOT, rounded)).toBe(true)
  })

  it('counts a missing person as 0', () => {
    const withSam = { ...SNAPSHOT, shares: [...SNAPSHOT.shares, { personId: 'sam', paidMinor: 0, owedMinor: 0, inputValue: 0 }] }
    expect(sameSplitInput(SNAPSHOT, withSam)).toBe(true)
  })

  it.each([
    ['another payer', { shares: [{ personId: 'me', paidMinor: 0, owedMinor: 500, inputValue: 1 }, { personId: 'priya', paidMinor: 1000, owedMinor: 500, inputValue: 1 }] }],
    ['another method', { method: 'shares' as const }],
    ['another number', { shares: [{ personId: 'me', paidMinor: 1000, owedMinor: 1000, inputValue: 1 }, { personId: 'priya', paidMinor: 0, owedMinor: 0, inputValue: 0 }] }],
  ])('is false for %s', (_name, changed) => {
    expect(sameSplitInput(SNAPSHOT, { ...SNAPSHOT, ...changed })).toBe(false)
  })
})

describe('expenseChanges', () => {
  it('is empty for identical versions', () => {
    expect(expenseChanges(SNAPSHOT, { ...SNAPSHOT })).toEqual([])
  })

  it('names each changed field with its old and new value, in a fixed order', () => {
    const after: ExpenseSnapshot = {
      ...SNAPSHOT,
      description: 'Lunch',
      category: 'food.groceries',
      amountMinor: 2000,
      currency: 'GBP',
      date: '2026-10-09',
      notes: 'Cash',
    }
    expect(expenseChanges(SNAPSHOT, after)).toEqual([
      { field: 'description', from: 'Dinner', to: 'Lunch' },
      { field: 'category', from: 'food.dining_out', to: 'food.groceries' },
      { field: 'amount', from: 1000, to: 2000 },
      { field: 'currency', from: 'INR', to: 'GBP' },
      { field: 'date', from: '2026-10-08', to: '2026-10-09' },
      { field: 'notes', from: null, to: 'Cash' },
    ])
  })

  it('names a new payer separately from a new split', () => {
    const swapped: ExpenseSnapshot = {
      ...SNAPSHOT,
      shares: [
        { personId: 'me', paidMinor: 0, owedMinor: 500, inputValue: 1 },
        { personId: 'priya', paidMinor: 1000, owedMinor: 500, inputValue: 1 },
      ],
    }
    expect(expenseChanges(SNAPSHOT, swapped)).toEqual([{ field: 'paidBy', from: 'me', to: 'priya' }])
  })

  it('records a split change with the method and the numbers entered for everyone', () => {
    const after: ExpenseSnapshot = {
      ...SNAPSHOT,
      method: 'percent',
      shares: [
        { personId: 'me', paidMinor: 1000, owedMinor: 700, inputValue: 70 },
        { personId: 'priya', paidMinor: 0, owedMinor: 300, inputValue: 30 },
      ],
    }
    expect(expenseChanges(SNAPSHOT, after)).toEqual([
      {
        field: 'split',
        from: { method: 'equal', values: { me: 1, priya: 1 } },
        to: { method: 'percent', values: { me: 70, priya: 30 } },
      },
    ])
  })

  it('records the photo ids before and after when photos were added or taken off', () => {
    const photos = [
      { id: 'b', position: 0, mimeType: 'image/png', sizeBytes: 9 },
      { id: 'a', position: 1, mimeType: 'image/jpeg', sizeBytes: 5 },
    ]
    expect(expenseChanges(SNAPSHOT, { ...SNAPSHOT, photos })).toEqual([
      { field: 'receipts', from: ['a'], to: ['b', 'a'] },
    ])
  })
})

describe('sameSnapshot', () => {
  it('is true for the same version, whatever the order of the shares, and a missing entered value is 0', () => {
    expect(sameSnapshot(SNAPSHOT, { ...SNAPSHOT })).toBe(true)
    expect(sameSnapshot(SNAPSHOT, { ...SNAPSHOT, shares: SNAPSHOT.shares.toReversed() })).toBe(true)
    const none = { ...SNAPSHOT, shares: SNAPSHOT.shares.map((share) => ({ ...share, inputValue: null })) }
    const zero = { ...SNAPSHOT, shares: SNAPSHOT.shares.map((share) => ({ ...share, inputValue: 0 })) }
    expect(sameSnapshot(none, zero)).toBe(true)
  })

  it.each([
    ['description', { description: 'Lunch' }],
    ['category', { category: 'general' }],
    ['amount', { amountMinor: 1200 }],
    ['currency', { currency: 'GBP' }],
    ['date', { date: '2026-10-09' }],
    ['notes', { notes: 'Cash' }],
    ['no notes against empty notes', { notes: '' }],
    ['method', { method: 'shares' as const }],
    ['what someone paid', { shares: [{ personId: 'me', paidMinor: 900, owedMinor: 500, inputValue: 1 }, { personId: 'priya', paidMinor: 0, owedMinor: 500, inputValue: 1 }] }],
    ['what someone owes', { shares: [{ personId: 'me', paidMinor: 1000, owedMinor: 501, inputValue: 1 }, { personId: 'priya', paidMinor: 0, owedMinor: 500, inputValue: 1 }] }],
    ['what was entered', { shares: [{ personId: 'me', paidMinor: 1000, owedMinor: 500, inputValue: 2 }, { personId: 'priya', paidMinor: 0, owedMinor: 500, inputValue: 1 }] }],
    ['a person', { shares: [{ personId: 'me', paidMinor: 1000, owedMinor: 500, inputValue: 1 }, { personId: 'sam', paidMinor: 0, owedMinor: 500, inputValue: 1 }] }],
    ['the photos', { photos: [] }],
    ['the order of the photos', { photos: [{ id: 'b', position: 0, mimeType: 'image/jpeg', sizeBytes: 5 }, { id: 'a', position: 1, mimeType: 'image/jpeg', sizeBytes: 5 }] }],
  ])('is false when %s differs', (_name, change) => {
    const base = { ...SNAPSHOT, photos: [{ id: 'a', position: 0, mimeType: 'image/jpeg', sizeBytes: 5 }, { id: 'b', position: 1, mimeType: 'image/jpeg', sizeBytes: 5 }] }
    expect(sameSnapshot(base, { ...base, ...change })).toBe(false)
  })
})
