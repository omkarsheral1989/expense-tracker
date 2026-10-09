import { describe, expect, it } from 'vitest'
import { dateService } from '../index.ts'

const { formatDay, toDay } = dateService

describe('toDay', () => {
  it('writes a local date as YYYY-MM-DD', () => {
    expect(toDay(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08')
    expect(toDay(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('formatDay', () => {
  it.each([
    ['2026-10-08', 'Today, 8 Oct 2026'],
    ['2026-10-07', 'Yesterday, 7 Oct 2026'],
    ['2026-10-05', 'Mon, 5 Oct 2026'],
    ['2026-10-09', 'Fri, 9 Oct 2026'],
    ['2025-09-30', 'Tue, 30 Sep 2025'],
  ])('shows %s as %j when today is 8 Oct 2026', (day, shown) => {
    expect(formatDay(day, '2026-10-08')).toBe(shown)
  })

  it('knows yesterday across a month and a year', () => {
    expect(formatDay('2025-12-31', '2026-01-01')).toBe('Yesterday, 31 Dec 2025')
    expect(formatDay('2026-02-28', '2026-03-01')).toBe('Yesterday, 28 Feb 2026')
  })
})
