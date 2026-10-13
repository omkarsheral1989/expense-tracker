import { describe, expect, it } from 'vitest'
import type { ExpenseShareDetails } from '../../../../../services/expenseService/types.ts'
import { displayName, shareSentence } from '../utils.ts'

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
  })
})

describe('shareSentence', () => {
  it.each([
    [{ ...you, paidMinor: 900, owedMinor: 300 }, 'You paid £9.00 and owe £3.00'],
    [{ ...you, owedMinor: 300 }, 'You owe £3.00'],
    [{ ...you, paidMinor: 900 }, 'You paid £9.00'],
    [{ ...priya, paidMinor: 900, owedMinor: 300 }, 'Priya Shah paid £9.00 and owes £3.00'],
    [{ ...priya, owedMinor: 600 }, 'Priya Shah owes £6.00'],
  ])('says %j as %j', (share, sentence) => {
    expect(shareSentence(share, 'GBP')).toBe(sentence)
  })
})
