import { describe, expect, it } from 'vitest'
import { joinNames } from '../utils.ts'

describe('joinNames', () => {
  it('joins names for a sentence, with "and" before the last', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Priya'])).toBe('Priya')
    expect(joinNames(['Priya', 'Sam'])).toBe('Priya and Sam')
    expect(joinNames(['Priya', 'Sam', 'Dev'])).toBe('Priya, Sam and Dev')
  })
})
