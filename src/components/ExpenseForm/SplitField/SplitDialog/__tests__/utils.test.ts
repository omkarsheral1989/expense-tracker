import { describe, expect, it } from 'vitest'
import type { SplitDraft } from '../types.ts'
import { draftFrom, draftProblem, previewOf, splitFromDraft, summaryOf } from '../utils.ts'

const MEMBERS = ['me', 'priya', 'sam']

function draft(overrides: Partial<SplitDraft>): SplitDraft {
  return {
    ...draftFrom({ paidBy: 'me', method: 'equal', values: { me: 1, priya: 1, sam: 1 } }, MEMBERS, 'GBP'),
    ...overrides,
  }
}

describe('draftFrom', () => {
  it('fills in the split\'s own tab, ticks everyone under Equally and leaves the rest empty', () => {
    expect(draftFrom({ paidBy: 'priya', method: 'exact', values: { me: 250, priya: 750 } }, MEMBERS, 'GBP')).toEqual({
      paidBy: 'priya',
      method: 'exact',
      equal: { me: true, priya: true, sam: true },
      exact: { me: '2.50', priya: '7.50', sam: '' },
      percent: { me: '', priya: '', sam: '' },
      shares: { me: '', priya: '', sam: '' },
      adjustment: { me: '', priya: '', sam: '' },
    })
  })

  it('keeps who is ticked for an equal split', () => {
    const { equal } = draftFrom({ paidBy: 'me', method: 'equal', values: { me: 0, priya: 1, sam: 1 } }, MEMBERS, 'GBP')
    expect(equal).toEqual({ me: false, priya: true, sam: true })
  })
})

describe('splitFromDraft', () => {
  it('reads the open tab, counting an empty entry as 0', () => {
    expect(splitFromDraft(draft({ method: 'exact', exact: { me: '2.5', priya: '', sam: '7.50' } }), 'GBP')).toEqual({
      paidBy: 'me',
      method: 'exact',
      values: { me: 250, priya: 0, sam: 750 },
    })
    expect(splitFromDraft(draft({ method: 'shares', shares: { me: '2', priya: '', sam: '1' } }), 'GBP').values).toEqual({
      me: 2,
      priya: 0,
      sam: 1,
    })
    expect(splitFromDraft(draft({ equal: { me: false, priya: true, sam: true } }), 'GBP').values).toEqual({
      me: 0,
      priya: 1,
      sam: 1,
    })
  })

  it('round-trips with draftFrom', () => {
    const split = { paidBy: 'sam', method: 'adjustment' as const, values: { me: 0, priya: 125, sam: 0 } }
    expect(splitFromDraft(draftFrom(split, MEMBERS, 'GBP'), 'GBP')).toEqual(split)
  })
})

describe('summaryOf', () => {
  it('shows what each person pays for an equal split', () => {
    expect(summaryOf(draft({}), 1000, 'GBP')).toEqual({ total: '£3.33/person (3 people)' })
    expect(summaryOf(draft({}), null, 'GBP')).toEqual({ total: '3 people' })
    expect(summaryOf(draft({ equal: { me: true, priya: false, sam: false } }), 1000, 'GBP')).toEqual({
      total: '£10.00/person (1 person)',
    })
  })

  it('shows how much of the amount is left or over for exact amounts and adjustments', () => {
    expect(summaryOf(draft({ method: 'exact', exact: { me: '8', priya: '', sam: '' } }), 1000, 'GBP')).toEqual({
      total: '£8.00 of £10.00',
      balance: { text: '£2.00 left', kind: 'left' },
    })
    expect(summaryOf(draft({ method: 'exact', exact: { me: '8', priya: '2', sam: '' } }), 1000, 'GBP').balance).toEqual({
      text: '£0.00 left',
      kind: 'done',
    })
    expect(summaryOf(draft({ method: 'adjustment', adjustment: { me: '11', priya: '', sam: '' } }), 1000, 'GBP').balance).toEqual({
      text: '£1.00 over',
      kind: 'over',
    })
  })

  it('shows percentages against 100%, and the total number of shares', () => {
    expect(summaryOf(draft({ method: 'percent', percent: { me: '50', priya: '25', sam: '' } }), 1000, 'GBP')).toEqual({
      total: '75% of 100%',
      balance: { text: '25% left', kind: 'left' },
    })
    expect(summaryOf(draft({ method: 'shares', shares: { me: '1', priya: '', sam: '' } }), 1000, 'GBP')).toEqual({
      total: '1 share in all',
    })
  })
})

describe('draftProblem', () => {
  it('needs the amount before amounts of money can be checked', () => {
    expect(draftProblem(draft({ method: 'exact' }), null, MEMBERS, 'GBP')).toBe('Enter the amount first.')
    expect(draftProblem(draft({ method: 'adjustment' }), null, MEMBERS, 'GBP')).toBe('Enter the amount first.')
  })

  it('accepts a split that works, even before the amount for ticks, percentages and shares', () => {
    expect(draftProblem(draft({}), null, MEMBERS, 'GBP')).toBeNull()
    expect(draftProblem(draft({ method: 'percent', percent: { me: '100', priya: '', sam: '' } }), null, MEMBERS, 'GBP')).toBeNull()
  })

  it('says what is wrong otherwise', () => {
    expect(draftProblem(draft({ equal: { me: false, priya: false, sam: false } }), 1000, MEMBERS, 'GBP')).toBe(
      'Choose at least one person.',
    )
    expect(draftProblem(draft({ method: 'percent', percent: { me: '90', priya: '', sam: '' } }), 1000, MEMBERS, 'GBP')).toBe(
      'The split no longer adds up.',
    )
  })
})

describe('previewOf', () => {
  it('gives each member\'s part, the payer taking what is left over', () => {
    expect(previewOf(draft({ paidBy: 'priya' }), 1000, MEMBERS, 'GBP')).toEqual({ me: 333, priya: 334, sam: 333 })
  })

  it('is null without an amount or while the split does not work', () => {
    expect(previewOf(draft({}), null, MEMBERS, 'GBP')).toBeNull()
    expect(previewOf(draft({ method: 'exact' }), 1000, MEMBERS, 'GBP')).toBeNull()
  })
})
