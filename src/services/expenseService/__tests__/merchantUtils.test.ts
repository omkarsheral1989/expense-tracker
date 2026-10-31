import { describe, expect, it } from 'vitest'
import type { ExpenseSnapshot } from '../../../db/types.ts'
import { distinctMerchants, expenseChanges, sameSnapshot } from '../utils.ts'

const ME = 'me'
const OTHER = 'other'

describe('distinctMerchants', () => {
  it('puts the user\'s own names first, then the others, keeping the order given within each', () => {
    const rows = [
      { merchant: 'Zepto', createdBy: OTHER },
      { merchant: 'Blinkit', createdBy: ME },
      { merchant: 'Swiggy', createdBy: OTHER },
      { merchant: '1mg', createdBy: ME },
    ]
    expect(distinctMerchants(rows, ME)).toEqual(['Blinkit', '1mg', 'Zepto', 'Swiggy'])
  })

  it('lists a name once, ignoring case and extra spaces, with the first spelling', () => {
    const rows = [
      { merchant: 'Astha  Medico', createdBy: OTHER },
      { merchant: 'astha medico', createdBy: ME },
      { merchant: ' ASTHA MEDICO ', createdBy: ME },
    ]
    expect(distinctMerchants(rows, ME)).toEqual(['Astha Medico'])
  })

  it('skips empty names', () => {
    expect(
      distinctMerchants(
        [
          { merchant: null, createdBy: ME },
          { merchant: '   ', createdBy: ME },
        ],
        ME,
      ),
    ).toEqual([])
  })
})

const snapshot: ExpenseSnapshot = {
  description: 'Milk',
  category: 'general',
  amountMinor: 100,
  currency: 'INR',
  date: '2026-10-08',
  notes: null,
  merchant: 'Blinkit',
  method: 'equal',
  shares: [{ personId: 'a', paidMinor: 100, owedMinor: 100, inputValue: 1 }],
  photos: [],
}

describe('expenseChanges and sameSnapshot with a merchant', () => {
  it('records a merchant change with the old and new values', () => {
    expect(expenseChanges(snapshot, { ...snapshot, merchant: 'Zepto' })).toEqual([
      { field: 'merchant', from: 'Blinkit', to: 'Zepto' },
    ])
    expect(expenseChanges(snapshot, { ...snapshot, merchant: null })).toEqual([
      { field: 'merchant', from: 'Blinkit', to: null },
    ])
  })

  it('treats a snapshot saved before merchants existed as having none', () => {
    const old: ExpenseSnapshot = { ...snapshot }
    delete old.merchant
    expect(expenseChanges(old, { ...old, merchant: null })).toEqual([])
    expect(expenseChanges(old, snapshot)).toEqual([{ field: 'merchant', from: null, to: 'Blinkit' }])
    expect(sameSnapshot(old, { ...old, merchant: null })).toBe(true)
  })

  it('is not the same snapshot when only the merchant differs', () => {
    expect(sameSnapshot(snapshot, { ...snapshot })).toBe(true)
    expect(sameSnapshot(snapshot, { ...snapshot, merchant: 'Zepto' })).toBe(false)
  })
})
