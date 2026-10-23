import { describe, expect, it } from 'vitest'
import { knownExpenseFrom, knownTitle } from '../utils.ts'

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

  const you = { email: 'omkar@gmail.com', name: 'Omkar', isYou: true }
  const priya = { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }
  const payment = { ...expense, category: 'settlement', description: 'Payment' }

  it('gives a payment with who paid and who received', () => {
    expect(knownExpenseFrom({ expense: { ...payment, payer: you, recipient: priya } }, GROUP, EXPENSE)).toEqual({ ...payment, payer: you, recipient: priya })
  })

  it.each([
    ['no payer', { recipient: priya }],
    ['no recipient', { payer: you }],
    ['a payer that is not a person', { payer: { name: 'x' }, recipient: priya }],
    ['a name that is not text', { payer: { ...you, name: 5 }, recipient: priya }],
    ['an email that is not text', { payer: you, recipient: { ...priya, email: 5 } }],
  ])('gives nothing for a payment with %s', (_name, people) => {
    expect(knownExpenseFrom({ expense: { ...payment, ...people } }, GROUP, EXPENSE)).toBeNull()
  })

  it('gives a deleted expense with who deleted it and when', () => {
    const at = new Date('2026-10-06T10:00:00Z')
    expect(knownExpenseFrom({ expense: { ...expense, deleted: { by: priya, at } } }, GROUP, EXPENSE)).toEqual({ ...expense, deleted: { by: priya, at } })
  })

  it.each([
    ['no deleter', { at: new Date() }],
    ['no time', { by: priya }],
    ['a time that is text', { by: priya, at: '2026-10-06T10:00:00Z' }],
    ['a time that is not a date', { by: priya, at: new Date('nope') }],
  ])('gives nothing for a deleted expense with %s', (_name, deleted) => {
    expect(knownExpenseFrom({ expense: { ...expense, deleted } }, GROUP, EXPENSE)).toBeNull()
  })

  it('does not copy a payer onto an ordinary expense', () => {
    expect(knownExpenseFrom({ expense: { ...expense, payer: you, recipient: priya } }, GROUP, EXPENSE)).toEqual(expense)
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

describe('knownTitle', () => {
  const base = { id: EXPENSE, groupId: GROUP, description: 'Payment', category: 'settlement', amountMinor: 900, currency: 'GBP', date: '2026-10-05' }
  it('words a payment by who paid whom', () => {
    const payer = { email: 'omkar@gmail.com', name: 'Omkar', isYou: true }
    const recipient = { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }
    expect(knownTitle({ ...base, payer, recipient })).toBe('You paid Priya')
    expect(knownTitle({ ...base, payer: recipient, recipient: payer })).toBe('Priya paid you')
  })
  it('is the description for an ordinary expense', () => {
    expect(knownTitle({ ...base, category: 'food.dining_out', description: 'Dinner' })).toBe('Dinner')
  })
})
