import { describe, expect, it } from 'vitest'
import { monthChangeOfSwipe, monthChangeOfWheel, shortMonthNames } from '../utils.ts'

describe('monthChangeOfSwipe', () => {
  it('goes to the next month for a swipe to the left, and back for one to the right', () => {
    expect(monthChangeOfSwipe(-120, 0)).toBe(1)
    expect(monthChangeOfSwipe(120, 0)).toBe(-1)
  })

  it('ignores a swipe that is too short', () => {
    expect(monthChangeOfSwipe(-49, 0)).toBe(0)
    expect(monthChangeOfSwipe(49, 0)).toBe(0)
    expect(monthChangeOfSwipe(-50, 0)).toBe(1)
  })

  it('ignores a gesture that goes more up or down than sideways', () => {
    expect(monthChangeOfSwipe(-80, 200)).toBe(0)
    expect(monthChangeOfSwipe(-80, -80)).toBe(0)
    expect(monthChangeOfSwipe(-80, 60)).toBe(1)
  })
})

describe('monthChangeOfWheel', () => {
  it('goes forward for down or right, and back for up or left', () => {
    expect(monthChangeOfWheel(0, 100)).toBe(1)
    expect(monthChangeOfWheel(100, 0)).toBe(1)
    expect(monthChangeOfWheel(0, -100)).toBe(-1)
    expect(monthChangeOfWheel(-100, 0)).toBe(-1)
  })

  it('follows the larger direction', () => {
    expect(monthChangeOfWheel(10, -100)).toBe(-1)
    expect(monthChangeOfWheel(-100, 10)).toBe(-1)
  })

  it('does nothing when there is no movement', () => {
    expect(monthChangeOfWheel(0, 0)).toBe(0)
  })
})

describe('shortMonthNames', () => {
  it('lists the twelve months in order, in the language', () => {
    const english = shortMonthNames('en-US')
    expect(english).toHaveLength(12)
    expect(english[0]).toBe('Jan')
    expect(english[11]).toBe('Dec')
    expect(shortMonthNames('de-DE')[2]).toMatch(/^Mär/)
  })
})
