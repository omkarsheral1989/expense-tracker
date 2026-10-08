import { describe, expect, it } from 'vitest'
import type { GroupMember } from '../../../../../../services/groupService/types.ts'
import { initialSplit, nameInSentence, quickChoices, sameSplit, splitProblem } from '../utils.ts'

const you: GroupMember = { personId: 'me', email: 'omkar@gmail.com', name: 'Omkar', isYou: true }
const priya: GroupMember = { personId: 'priya', email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }
const sam: GroupMember = { personId: 'sam', email: 'sam.k@gmail.com', name: null, isYou: false }

describe('nameInSentence', () => {
  it('says "you" for the user, and the first name (or email before the @, with a capital) for others', () => {
    expect(nameInSentence(you)).toBe('you')
    expect(nameInSentence(priya)).toBe('Priya')
    expect(nameInSentence(sam)).toBe('Sam.k')
  })
})

describe('initialSplit', () => {
  it('has the user paying and everyone in an equal split', () => {
    expect(initialSplit([you, priya, sam])).toEqual({
      paidBy: 'me',
      method: 'equal',
      values: { me: 1, priya: 1, sam: 1 },
    })
  })
})

describe('quickChoices', () => {
  it('names someone without a name by their email, with a capital', () => {
    expect(quickChoices(you, sam)[2].label).toBe('Sam.k paid, split equally')
  })

  it('offers the four ways two people can share an expense', () => {
    expect(quickChoices(you, priya)).toEqual([
      { label: 'You paid, split equally', value: { paidBy: 'me', method: 'equal', values: { me: 1, priya: 1 } } },
      { label: 'You are owed the full amount', value: { paidBy: 'me', method: 'equal', values: { me: 0, priya: 1 } } },
      { label: 'Priya paid, split equally', value: { paidBy: 'priya', method: 'equal', values: { me: 1, priya: 1 } } },
      { label: 'Priya is owed the full amount', value: { paidBy: 'priya', method: 'equal', values: { me: 1, priya: 0 } } },
    ])
  })
})

describe('sameSplit', () => {
  it('compares payer, method and numbers, a missing number counting as 0', () => {
    const split = { paidBy: 'me', method: 'equal' as const, values: { me: 0, priya: 1 } }
    expect(sameSplit(split, { ...split, values: { priya: 1 } })).toBe(true)
    expect(sameSplit(split, { ...split, paidBy: 'priya' })).toBe(false)
    expect(sameSplit(split, { ...split, method: 'shares' })).toBe(false)
    expect(sameSplit(split, { ...split, values: { me: 1, priya: 1 } })).toBe(false)
  })
})

describe('splitProblem', () => {
  const members = [you, priya]

  it('is null with no amount yet, or when the split works', () => {
    const exact = { paidBy: 'me', method: 'exact' as const, values: { me: 400, priya: 600 } }
    expect(splitProblem(null, exact, members)).toBeNull()
    expect(splitProblem(1000, exact, members)).toBeNull()
  })

  it('says the split no longer adds up when the amount changed under exact amounts', () => {
    const exact = { paidBy: 'me', method: 'exact' as const, values: { me: 400, priya: 600 } }
    expect(splitProblem(1200, exact, members)).toBe('The split no longer adds up.')
  })
})
