import { describe, expect, it } from 'vitest'
import type { ExpenseShareDetails } from '../../../../../services/expenseService/types.ts'
import { displayName, owedSentence, paidSentence } from '../utils.ts'

const you: ExpenseShareDetails = {
  personId: 'me',
  email: 'omkar@gmail.com',
  name: 'Omkar',
  isYou: true,
  paidMinor: 0,
  owedMinor: 0,
}
const priya: ExpenseShareDetails = { ...you, personId: 'priya', email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }

describe('displayName', () => {
  it('is "You" for the user, the full name for others, or their email', () => {
    expect(displayName(you)).toBe('You')
    expect(displayName(priya)).toBe('Priya Shah')
    expect(displayName({ ...priya, name: null })).toBe('priya@gmail.com')
    expect(displayName({ ...priya, name: 'Rahul', email: null })).toBe('Rahul')
  })
})

describe('paidSentence', () => {
  it.each([
    [{ ...you, paidMinor: 900, owedMinor: 300 }, 'You paid £9.00'],
    [{ ...priya, paidMinor: 900 }, 'Priya Shah paid £9.00'],
    [{ ...priya, name: null, paidMinor: 900 }, 'priya@gmail.com paid £9.00'],
  ])('says %j as %j', (share, sentence) => {
    expect(paidSentence(share, 'GBP')).toBe(sentence)
  })
})

describe('owedSentence', () => {
  it.each([
    [{ ...you, owedMinor: 300 }, 'You owe £3.00'],
    [{ ...you, paidMinor: 900, owedMinor: 300 }, 'You owe £3.00'],
    [{ ...priya, owedMinor: 600 }, 'Priya Shah owes £6.00'],
    [{ ...priya, paidMinor: 900, owedMinor: 300 }, 'Priya Shah owes £3.00'],
  ])('says %j as %j', (share, sentence) => {
    expect(owedSentence(share, 'GBP')).toBe(sentence)
  })
})
