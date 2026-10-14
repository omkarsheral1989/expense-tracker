import { describe, expect, it } from 'vitest'
import { labelFontSize } from '../utils.ts'

describe('labelFontSize', () => {
  it('is large for a one-character symbol', () => {
    expect(labelFontSize('$')).toBe(18)
    expect(labelFontSize('₹')).toBe(18)
  })

  it('is smaller for a longer symbol', () => {
    expect(labelFontSize('CA$')).toBe(14)
    expect(labelFontSize('A$')).toBe(14)
  })

  it('is smallest for a three-letter code', () => {
    expect(labelFontSize('CHF')).toBe(12)
  })

  it('is smallest for a long symbol', () => {
    expect(labelFontSize('F CFA')).toBe(12)
  })
})
