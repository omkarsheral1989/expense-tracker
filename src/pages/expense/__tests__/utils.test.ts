import { describe, expect, it } from 'vitest'
import { knownExpenseFrom } from '../utils.ts'

const GROUP = '3f2a6c1e-8b7d-4e5f-9a10-b2c3d4e5f607'
const EXPENSE = '3f2a6c1e-8b7d-4e5f-9a10-b2c3d4e5f608'
const expense = { id: EXPENSE, groupId: GROUP, description: 'Dinner', category: 'food.dining_out', amountMinor: 900, currency: 'GBP', date: '2026-10-05' }

describe('knownExpenseFrom', () => {
  it('gives the expense the page was opened with, keeping only what the band needs', () => {
    expect(knownExpenseFrom({ expense: { ...expense, payer: { isYou: true }, yourPaidMinor: 900 } }, GROUP, EXPENSE)).toEqual(expense)
  })

  it('gives nothing for another expense or another group, so a stale state is never shown', () => {
    expect(knownExpenseFrom({ expense }, GROUP, 'other')).toBeNull()
    expect(knownExpenseFrom({ expense }, 'other', EXPENSE)).toBeNull()
  })

  it('gives nothing for a payment, whose page is worded differently', () => {
    expect(knownExpenseFrom({ expense: { ...expense, category: 'settlement' } }, GROUP, EXPENSE)).toBeNull()
  })

  it.each([
    ['no state', null],
    ['a state without an expense', {}],
    ['a state that is not an object', 'x'],
    ['no id', { expense: { ...expense, id: undefined } }],
    ['no group', { expense: { ...expense, groupId: undefined } }],
    ['a description that is not text', { expense: { ...expense, description: 5 } }],
    ['no category', { expense: { ...expense, category: undefined } }],
    ['an amount that is not a number', { expense: { ...expense, amountMinor: '900' } }],
    ['no currency', { expense: { ...expense, currency: undefined } }],
    ['no date', { expense: { ...expense, date: undefined } }],
    ['a date that is not a day', { expense: { ...expense, date: '5 Oct 2026' } }],
  ])('gives nothing for %s', (_name, state) => {
    expect(knownExpenseFrom(state, GROUP, EXPENSE)).toBeNull()
  })
})
