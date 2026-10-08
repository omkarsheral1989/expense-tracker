import { describe, expect, it } from 'vitest'
import type { FormValues } from '../types.ts'
import { formatDay, hasUnsavedInput, recentCurrencyCodes, toDay, toFormFields } from '../utils.ts'

describe('toDay', () => {
  it('writes a local date as YYYY-MM-DD', () => {
    expect(toDay(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08')
    expect(toDay(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('formatDay', () => {
  it.each([
    ['2026-10-08', 'Today, 8 Oct 2026'],
    ['2026-10-07', 'Yesterday, 7 Oct 2026'],
    ['2026-10-05', 'Mon, 5 Oct 2026'],
    ['2026-10-09', 'Fri, 9 Oct 2026'],
    ['2025-09-30', 'Tue, 30 Sep 2025'],
  ])('shows %s as %j when today is 8 Oct 2026', (day, shown) => {
    expect(formatDay(day, '2026-10-08')).toBe(shown)
  })

  it('knows yesterday across a month and a year', () => {
    expect(formatDay('2025-12-31', '2026-01-01')).toBe('Yesterday, 31 Dec 2025')
    expect(formatDay('2026-02-28', '2026-03-01')).toBe('Yesterday, 28 Feb 2026')
  })
})

describe('recentCurrencyCodes', () => {
  it('puts the group\'s currency first, then the recent ones, three at most', () => {
    expect(recentCurrencyCodes('GBP', [])).toEqual(['GBP'])
    expect(recentCurrencyCodes('GBP', ['EUR', 'USD', 'INR'])).toEqual(['GBP', 'EUR', 'USD'])
    expect(recentCurrencyCodes('GBP', ['EUR', 'GBP', 'INR'])).toEqual(['GBP', 'EUR', 'INR'])
  })
})

describe('hasUnsavedInput', () => {
  const initial: FormValues = {
    description: '',
    category: 'general',
    amount: '',
    currency: 'GBP',
    date: '2026-10-08',
    notes: '',
    split: { paidBy: 'me', method: 'equal', values: { me: 1, priya: 1 } },
  }

  it('is false for an untouched form, and for spaces only', () => {
    expect(hasUnsavedInput(undefined, initial)).toBe(false)
    expect(hasUnsavedInput(initial, initial)).toBe(false)
    expect(hasUnsavedInput({ ...initial, description: '  ', notes: ' ' }, initial)).toBe(false)
  })

  it.each([
    ['description', { description: 'Dinner' }],
    ['amount', { amount: '0' }],
    ['notes', { notes: 'Card' }],
    ['category', { category: 'food.groceries' }],
    ['currency', { currency: 'EUR' }],
    ['date', { date: '2026-10-07' }],
    ['payer', { split: { paidBy: 'priya', method: 'equal' as const, values: { me: 1, priya: 1 } } }],
    ['split', { split: { paidBy: 'me', method: 'equal' as const, values: { me: 0, priya: 1 } } }],
  ])('is true once the %s changes', (_, change) => {
    expect(hasUnsavedInput({ ...initial, ...change }, initial)).toBe(true)
  })
})

describe('toFormFields', () => {
  it('puts the amount\'s message under the amount field and clears the others', () => {
    expect(toFormFields({ description: 'Enter a description.', amountMinor: 'Enter an amount.' })).toEqual([
      { name: 'description', errors: ['Enter a description.'] },
      { name: 'category', errors: [] },
      { name: 'amount', errors: ['Enter an amount.'] },
      { name: 'currency', errors: [] },
      { name: 'date', errors: [] },
      { name: 'notes', errors: [] },
      { name: 'split', errors: [] },
    ])
  })

  it('puts problems with who paid under the split', () => {
    expect(toFormFields({ paidBy: 'Choose who paid.' }).find((field) => field.name === 'split')).toEqual({
      name: 'split',
      errors: ['Choose who paid.'],
    })
  })
})
