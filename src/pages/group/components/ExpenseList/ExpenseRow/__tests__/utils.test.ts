import { describe, expect, it } from 'vitest'
import type { ExpenseListItem } from '../../../../../../services/expenseService/types.ts'
import { dateParts, expenseStatus } from '../utils.ts'

const expense: ExpenseListItem = {
  id: 'e1',
  description: 'Dinner',
  category: 'general',
  amountMinor: 1000,
  currency: 'GBP',
  date: '2026-10-08',
  payer: null,
  yourPaidMinor: 0,
  yourOwedMinor: 0,
  involved: true,
}

describe('expenseStatus', () => {
  it('says the user lent what they paid beyond their share', () => {
    expect(expenseStatus({ ...expense, yourPaidMinor: 1000, yourOwedMinor: 334 })).toEqual({
      kind: 'lent',
      amountMinor: 666,
    })
  })

  it('says the user borrowed their share when someone else paid', () => {
    expect(expenseStatus({ ...expense, yourPaidMinor: 0, yourOwedMinor: 333 })).toEqual({
      kind: 'borrowed',
      amountMinor: 333,
    })
  })

  it('says nothing is owed when the user paid exactly their share', () => {
    expect(expenseStatus({ ...expense, yourPaidMinor: 1000, yourOwedMinor: 1000 })).toEqual({
      kind: 'even',
    })
  })

  it('says the user is not involved when they have no part in it', () => {
    expect(expenseStatus({ ...expense, involved: false })).toEqual({ kind: 'notInvolved' })
  })
})

describe('dateParts', () => {
  it.each([
    ['2026-10-08', 'Oct', 8],
    ['2026-01-31', 'Jan', 31],
    ['2025-09-01', 'Sep', 1],
  ])('splits %s into %s and %i', (day, month, date) => {
    expect(dateParts(day)).toEqual({ month, day: date })
  })
})
