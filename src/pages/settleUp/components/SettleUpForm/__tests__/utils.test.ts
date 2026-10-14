import { describe, expect, it } from 'vitest'
import type { GroupMember } from '../../../../../services/groupService/types.ts'
import type { FormValues } from '../types.ts'
import { hasUnsavedInput, memberLabel, recentCurrencyCodes, toFormFields } from '../utils.ts'

const initial: FormValues = {
  payerId: 'me',
  recipientId: undefined,
  amount: '',
  currency: 'GBP',
  date: '2026-10-08',
  notes: '',
  receipts: [],
}

describe('recentCurrencyCodes', () => {
  it('lists the group\'s default first, then the latest ones, each once, at most three', () => {
    expect(recentCurrencyCodes('GBP', ['INR', 'GBP', 'EUR', 'USD'])).toEqual(['GBP', 'INR', 'EUR'])
    expect(recentCurrencyCodes('GBP', [])).toEqual(['GBP'])
  })
})

describe('memberLabel', () => {
  const member = (overrides: Partial<GroupMember>): GroupMember => ({
    personId: 'x',
    email: 'priya@gmail.com',
    name: 'Priya Shah',
    isYou: false,
    ...overrides,
  })

  it('says "You" for the user, whatever their name', () => {
    expect(memberLabel(member({ isYou: true }))).toBe('You')
  })

  it('uses the name, else the email, else a member added by name alone', () => {
    expect(memberLabel(member({}))).toBe('Priya Shah')
    expect(memberLabel(member({ name: null }))).toBe('priya@gmail.com')
    expect(memberLabel(member({ email: null }))).toBe('Priya Shah')
  })
})

describe('hasUnsavedInput', () => {
  it('is false before the form has values, and for the values it opened with', () => {
    expect(hasUnsavedInput(undefined, initial)).toBe(false)
    expect(hasUnsavedInput({ ...initial }, initial)).toBe(false)
  })

  it.each([
    ['a recipient is chosen', { recipientId: 'priya' }],
    ['an amount is typed', { amount: '10' }],
    ['a note is written', { notes: 'cash' }],
    ['the payer is changed', { payerId: 'priya' }],
    ['the currency is changed', { currency: 'EUR' }],
    ['the date is changed', { date: '2026-10-01' }],
    ['a photo is added', { receipts: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }],
  ])('is true once %s', (_what, change) => {
    expect(hasUnsavedInput({ ...initial, ...change }, initial)).toBe(true)
  })

  it('does not count spaces in the notes as input', () => {
    expect(hasUnsavedInput({ ...initial, notes: '   ' }, initial)).toBe(false)
  })
})

describe('toFormFields', () => {
  it('gives each field its message, the amount\'s under "amount", and clears the others', () => {
    expect(toFormFields({ recipientId: 'Choose who received it.', amountMinor: 'Enter an amount.' })).toEqual([
      { name: 'payerId', errors: [] },
      { name: 'recipientId', errors: ['Choose who received it.'] },
      { name: 'amount', errors: ['Enter an amount.'] },
      { name: 'currency', errors: [] },
      { name: 'date', errors: [] },
      { name: 'notes', errors: [] },
      { name: 'receipts', errors: [] },
    ])
  })

  it('clears everything when there are no problems', () => {
    expect(toFormFields({}).every((field) => field.errors?.length === 0)).toBe(true)
  })
})
