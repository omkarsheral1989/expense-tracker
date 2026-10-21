import { describe, expect, it } from 'vitest'
import type { ExpenseChange } from '../../../db/types.ts'
import type { ExpenseHistoryEntry, ExpensePerson } from '../../../services/expenseService/types.ts'
import { historyHeader, historyLines, QUOTE_MAX_LENGTH } from '../history.ts'

const people: Record<string, ExpensePerson> = {
  me: { email: 'omkar@gmail.com', name: 'Omkar', isYou: true },
  priya: { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false },
  sam: { email: 'sam@gmail.com', name: null, isYou: false },
}

/** One edit by you, in INR unless said otherwise, with the changes given. */
function entry(changes: ExpenseChange[], currencyBefore = 'INR'): ExpenseHistoryEntry {
  return { id: 'event', kind: 'edited', by: people.me, at: new Date(2026, 9, 20, 18, 15), changes, currencyBefore }
}

const lines = (changes: ExpenseChange[], currencyBefore?: string) =>
  historyLines(entry(changes, currencyBefore), people)

describe('historyLines', () => {
  it('is empty for an edit that changed nothing', () => {
    expect(lines([])).toEqual([])
  })

  it('writes text changes with the old and new text quoted', () => {
    expect(lines([{ field: 'description', from: 'Dinner', to: 'Lunch' }])).toEqual([
      { text: "Description changed from 'Dinner' to 'Lunch'" },
    ])
    expect(lines([{ field: 'notes', from: 'some notes', to: 'more notes' }])).toEqual([
      { text: "Notes changed from 'some notes' to 'more notes'" },
    ])
  })

  it('says when notes were added or removed', () => {
    expect(lines([{ field: 'notes', from: null, to: 'Cash' }])).toEqual([{ text: "Notes added: 'Cash'" }])
    expect(lines([{ field: 'notes', from: 'Cash', to: null }])).toEqual([{ text: "Notes removed (were 'Cash')" }])
  })

  it('cuts long text after 80 characters with an ellipsis, and leaves short text alone', () => {
    const long = 'a'.repeat(QUOTE_MAX_LENGTH + 20)
    const [line] = lines([{ field: 'description', from: long, to: 'b' }])
    expect(line.text).toBe(`Description changed from '${'a'.repeat(QUOTE_MAX_LENGTH)}…' to 'b'`)
    expect(lines([{ field: 'description', from: 'a'.repeat(QUOTE_MAX_LENGTH), to: 'b' }])[0].text).not.toContain('…')
  })

  it('names categories as the details page does', () => {
    expect(lines([{ field: 'category', from: 'food.dining_out', to: 'food.groceries' }])).toEqual([
      { text: 'Category changed from Dining out to Groceries' },
    ])
    expect(lines([{ field: 'category', from: 'general', to: 'food.other' }])[0].text).toBe(
      'Category changed from General to Food and drink: Other',
    )
  })

  it('writes the cost with the currency it had, then the currency it has', () => {
    expect(lines([{ field: 'amount', from: 10000, to: 12050 }])).toEqual([
      { text: 'Cost changed from ₹100.00 to ₹120.50' },
    ])
    // With a new currency, each amount shows its own and there is no separate currency line.
    expect(
      lines([
        { field: 'amount', from: 10000, to: 12000 },
        { field: 'currency', from: 'INR', to: 'GBP' },
      ]),
    ).toEqual([{ text: 'Cost changed from ₹100.00 to £120.00' }])
  })

  it('names a currency change on its own when the cost stayed', () => {
    expect(lines([{ field: 'currency', from: 'INR', to: 'GBP' }])).toEqual([
      { text: 'Currency changed from INR to GBP' },
    ])
  })

  it('writes dates plainly, without a weekday', () => {
    expect(lines([{ field: 'date', from: '2026-10-05', to: '2026-10-06' }])).toEqual([
      { text: 'Date changed from 5 Oct 2026 to 6 Oct 2026' },
    ])
  })

  it('names who paid, "you" in the middle of a sentence and the person\'s name otherwise', () => {
    expect(lines([{ field: 'paidBy', from: 'me', to: 'priya' }])).toEqual([
      { text: 'Paid by changed from you to Priya Shah' },
    ])
    expect(lines([{ field: 'paidBy', from: 'priya', to: 'sam' }])).toEqual([
      { text: 'Paid by changed from Priya Shah to sam@gmail.com' },
    ])
  })

  describe('a split', () => {
    const split = (method: string, values: Record<string, number>) => ({ method, values })

    it('lists, in the method\'s units, each person whose number changed, you first', () => {
      expect(
        lines([
          {
            field: 'split',
            from: split('percent', { me: 50, priya: 30, sam: 20 }),
            to: split('percent', { me: 40, priya: 40, sam: 20 }),
          },
        ]),
      ).toEqual([{ text: 'Split changed', nested: ['You: 50% to 40%', 'Priya Shah: 30% to 40%'] }])
    })

    it.each([
      ['exact', { me: 10000 }, { me: 15000 }, 'You: ₹100.00 to ₹150.00'],
      ['shares', { me: 2 }, { me: 1 }, 'You: 2 shares to 1 share'],
      ['adjustment', { me: 500 }, { me: 1000 }, 'You: +₹5.00 to +₹10.00'],
      ['equal', { me: 1 }, { me: 0 }, 'You: in the split to not in the split'],
    ])('writes %s numbers in their own units', (method, from, to, line) => {
      expect(lines([{ field: 'split', from: split(method, from), to: split(method, to) }])).toEqual([
        { text: 'Split changed', nested: [line] },
      ])
    })

    it('names the old and new method, and shows each person from the old units to the new', () => {
      expect(
        lines([
          {
            field: 'split',
            from: split('equal', { me: 1, priya: 1, sam: 1 }),
            to: split('percent', { me: 50, priya: 30, sam: 20 }),
          },
        ]),
      ).toEqual([
        {
          text: 'Split changed from equally to by percentages',
          nested: ['You: in the split to 50%', 'Priya Shah: in the split to 30%', 'sam@gmail.com: in the split to 20%'],
        },
      ])
    })

    it('treats a person missing from one side as 0, and leaves out people who read the same', () => {
      // Nobody reads differently, so there is nothing to nest.
      expect(
        lines([
          { field: 'split', from: split('percent', { me: 100 }), to: split('percent', { me: 100, priya: 0 }) },
        ]),
      ).toEqual([{ text: 'Split changed' }])
    })
  })

  it('counts photos added and removed, one line each', () => {
    expect(lines([{ field: 'receipts', from: ['a'], to: ['a', 'b', 'c'] }])).toEqual([{ text: '2 photos added' }])
    expect(lines([{ field: 'receipts', from: ['a', 'b'], to: ['b'] }])).toEqual([{ text: '1 photo removed' }])
    expect(lines([{ field: 'receipts', from: ['a', 'b'], to: ['b', 'c'] }])).toEqual([
      { text: '1 photo added' },
      { text: '1 photo removed' },
    ])
  })

  it('writes the lines in a fixed order whatever order the changes are stored in', () => {
    const result = lines([
      { field: 'receipts', from: [], to: ['a'] },
      { field: 'paidBy', from: 'me', to: 'priya' },
      { field: 'date', from: '2026-10-05', to: '2026-10-06' },
      { field: 'amount', from: 100, to: 200 },
      { field: 'category', from: 'general', to: 'food.groceries' },
      { field: 'notes', from: null, to: 'Cash' },
      { field: 'description', from: 'a', to: 'b' },
    ])
    expect(result.map((line) => line.text.split(' ')[0])).toEqual([
      'Description',
      'Notes',
      'Category',
      'Cost',
      'Date',
      'Paid',
      '1',
    ])
  })

  it('says "someone" for a person it does not know', () => {
    expect(lines([{ field: 'paidBy', from: 'me', to: 'unknown' }])[0].text).toBe('Paid by changed from you to someone')
  })
})

describe('historyHeader', () => {
  it('says what happened, "You" for the user and the name otherwise, or the email when there is none', () => {
    expect(historyHeader(people.me, 'edited')).toBe('You edited this expense')
    expect(historyHeader(people.priya, 'edited')).toBe('Priya Shah edited this expense')
    expect(historyHeader(people.sam, 'added')).toBe('sam@gmail.com added this expense')
  })

  it('says "restored the version from <time>" for going back to an earlier version', () => {
    const from = new Date(2026, 9, 20, 18, 4)
    expect(historyHeader(people.me, 'reverted', 'expense', from)).toMatch(/^You restored the version from 20 Oct 2026, 6:04\s?PM$/)
    expect(historyHeader(people.priya, 'reverted', 'expense', from)).toMatch(/^Priya Shah restored the version from 20 Oct 2026/)
    // Without the time of that version, it still reads.
    expect(historyHeader(people.me, 'reverted')).toBe('You restored the version')
  })

  it('words the edit and the other kinds, for an expense and for a payment', () => {
    expect(historyHeader(people.me, 'added')).toBe('You added this expense')
    expect(historyHeader(people.me, 'restored')).toBe('You restored this expense')
    expect(historyHeader(people.me, 'deleted', 'payment')).toBe('You deleted this payment')
  })

  it('writes the lines of a reversion as it does those of an edit', () => {
    const entry: ExpenseHistoryEntry = { id: 'x', kind: 'reverted', by: people.me, at: new Date(), changes: [{ field: 'description', from: 'Lunch', to: 'Dinner' }], currencyBefore: 'INR' }
    expect(historyLines(entry, people)).toEqual([{ text: "Description changed from 'Lunch' to 'Dinner'" }])
  })
})
