import { describe, expect, it } from 'vitest'
import type { FormValues } from '../types.ts'
import { hasUnsavedInput, recentCurrencyCodes, toFormFields } from '../utils.ts'

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
