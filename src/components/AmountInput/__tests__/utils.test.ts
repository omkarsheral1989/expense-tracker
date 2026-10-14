import { describe, expect, it } from 'vitest'
import { caretAfter, keptBefore } from '../utils.ts'

describe('keptBefore', () => {
  it('counts the digits and "." before the caret, not the separators', () => {
    expect(keptBefore('1,234.5', 7)).toBe(6)
    expect(keptBefore('1,234.5', 2)).toBe(1)
    expect(keptBefore('1,234.5', 0)).toBe(0)
  })
})

describe('caretAfter', () => {
  it.each([
    ['1,234', 4, 5],
    ['1,234', 1, 1],
    ['1,234', 2, 3],
    ['1,23,456.7', 6, 8],
    ['1,23,456.7', 8, 10],
    ['1,234', 0, 0],
    ['12', 9, 2],
  ])('in %j puts the caret after %i kept characters at %i', (shown, kept, caret) => {
    expect(caretAfter(shown, kept)).toBe(caret)
  })
})
