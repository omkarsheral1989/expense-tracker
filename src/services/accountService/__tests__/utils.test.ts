import { describe, expect, it } from 'vitest'
import { comparableName, inPeriod, monthPeriod, periodOf, quarterPeriod, rateOf, spendOf } from '../utils.ts'

describe('comparableName', () => {
  it('ignores case and extra spaces', () => {
    expect(comparableName('  HDFC   Regalia ')).toBe('hdfc regalia')
  })
})

describe('monthPeriod', () => {
  it('is the calendar month with no statement day', () => {
    expect(monthPeriod('2026-10-26', null)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(monthPeriod('2026-02-10', null)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('starts on the statement day and ends the day before the next one', () => {
    expect(monthPeriod('2026-10-26', 15)).toEqual({ start: '2026-10-15', end: '2026-11-14' })
  })

  it('starts the cycle in the month before when today is earlier than the statement day', () => {
    expect(monthPeriod('2026-10-10', 15)).toEqual({ start: '2026-09-15', end: '2026-10-14' })
  })

  it('counts the statement day itself as the first day of the new cycle', () => {
    expect(monthPeriod('2026-10-15', 15)).toEqual({ start: '2026-10-15', end: '2026-11-14' })
    expect(monthPeriod('2026-10-14', 15)).toEqual({ start: '2026-09-15', end: '2026-10-14' })
  })

  it('crosses a year end', () => {
    expect(monthPeriod('2026-01-10', 15)).toEqual({ start: '2025-12-15', end: '2026-01-14' })
    expect(monthPeriod('2026-12-20', 15)).toEqual({ start: '2026-12-15', end: '2027-01-14' })
  })

  it('works with the last statement day offered (28), in the shortest month too', () => {
    expect(monthPeriod('2026-03-01', 28)).toEqual({ start: '2026-02-28', end: '2026-03-27' })
    expect(monthPeriod('2026-02-28', 28)).toEqual({ start: '2026-02-28', end: '2026-03-27' })
  })
})

describe('quarterPeriod', () => {
  it('is the calendar quarter with no statement day', () => {
    expect(quarterPeriod('2026-10-26', null)).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(quarterPeriod('2026-08-05', null)).toEqual({ start: '2026-07-01', end: '2026-09-30' })
    expect(quarterPeriod('2026-03-31', null)).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('starts on the statement day of January, April, July or October', () => {
    expect(quarterPeriod('2026-10-26', 15)).toEqual({ start: '2026-10-15', end: '2027-01-14' })
    expect(quarterPeriod('2026-11-20', 15)).toEqual({ start: '2026-10-15', end: '2027-01-14' })
  })

  it('is still in the quarter before until the statement day of its first month', () => {
    expect(quarterPeriod('2026-01-10', 15)).toEqual({ start: '2025-10-15', end: '2026-01-14' })
    expect(quarterPeriod('2026-01-15', 15)).toEqual({ start: '2026-01-15', end: '2026-04-14' })
  })

  it('always contains the statement cycle of the same day', () => {
    for (const today of ['2026-01-10', '2026-04-14', '2026-07-31', '2026-10-15', '2026-12-31']) {
      const month = monthPeriod(today, 15)
      const quarter = quarterPeriod(today, 15)
      expect(inPeriod(month.start, quarter), today).toBe(true)
      expect(inPeriod(month.end, quarter), today).toBe(true)
    }
  })
})

describe('periodOf', () => {
  it('picks the month or the quarter', () => {
    expect(periodOf('month', '2026-10-26', null)).toEqual(monthPeriod('2026-10-26', null))
    expect(periodOf('quarter', '2026-10-26', null)).toEqual(quarterPeriod('2026-10-26', null))
  })
})

describe('inPeriod', () => {
  const period = { start: '2026-10-15', end: '2026-11-14' }

  it('includes both ends and nothing outside them', () => {
    expect(inPeriod('2026-10-15', period)).toBe(true)
    expect(inPeriod('2026-11-14', period)).toBe(true)
    expect(inPeriod('2026-10-14', period)).toBe(false)
    expect(inPeriod('2026-11-15', period)).toBe(false)
  })
})

describe('spendOf', () => {
  it('counts what the account was debited when that was entered, in any currency', () => {
    expect(spendOf({ currency: 'USD', paidMinor: 10000, chargedMinor: 7850 }, 'GBP')).toEqual({ counted: 7850 })
    expect(spendOf({ currency: 'GBP', paidMinor: 10000, chargedMinor: 9900 }, 'GBP')).toEqual({ counted: 9900 })
  })

  it('counts what the user paid when the expense is in the account\'s currency', () => {
    expect(spendOf({ currency: 'GBP', paidMinor: 10000, chargedMinor: null }, 'GBP')).toEqual({ counted: 10000 })
  })

  it('cannot count an expense in another currency with no charged amount', () => {
    expect(spendOf({ currency: 'USD', paidMinor: 10000, chargedMinor: null }, 'GBP')).toEqual({ counted: null })
  })

  it('counts nothing for an expense the user did not pay', () => {
    expect(spendOf({ currency: 'USD', paidMinor: 0, chargedMinor: null }, 'GBP')).toEqual({ counted: 0 })
    expect(spendOf({ currency: 'GBP', paidMinor: 0, chargedMinor: 500 }, 'GBP')).toEqual({ counted: 0 })
  })
})

describe('rateOf', () => {
  const dollars = { minor: 10000, decimals: 2 }
  const pounds = { minor: 7850, decimals: 2 }

  it('is what one unit of the first currency came to in the second, with 2 decimals', () => {
    expect(rateOf({ minor: 10000, decimals: 2 }, { minor: 841300, decimals: 2 })).toBe('84.13')
  })

  it('has 4 decimals when it is below 1', () => {
    expect(rateOf(dollars, pounds)).toBe('0.7850')
  })

  it('works the other way round', () => {
    expect(rateOf(pounds, dollars)).toBe('1.27')
  })

  it('takes each currency\'s own decimals into account', () => {
    // 10,000 yen (no decimals) charged as 50.00 pounds is 0.005 pounds a yen.
    expect(rateOf({ minor: 10000, decimals: 0 }, { minor: 5000, decimals: 2 })).toBe('0.0050')
  })

  it('is null without both amounts', () => {
    expect(rateOf({ minor: 0, decimals: 2 }, pounds)).toBeNull()
    expect(rateOf(dollars, { minor: 0, decimals: 2 })).toBeNull()
  })
})
