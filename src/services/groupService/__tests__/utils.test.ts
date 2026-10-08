import { describe, expect, it } from 'vitest'
import { shortName } from '../utils.ts'

describe('shortName', () => {
  it.each([
    [{ name: 'Priya Shah', email: 'priya@gmail.com' }, 'Priya'],
    [{ name: '  Sam  ', email: 'sam@gmail.com' }, 'Sam'],
    [{ name: null, email: 'ana.k@gmail.com' }, 'ana.k'],
    [{ name: '   ', email: 'ana.k@gmail.com' }, 'ana.k'],
  ])('names %j as %j', (person, name) => {
    expect(shortName(person)).toBe(name)
  })

  it('starts with a capital when it opens a sentence', () => {
    expect(shortName({ name: null, email: 'sam@gmail.com' }, { sentenceStart: true })).toBe('Sam')
    expect(shortName({ name: 'priya', email: 'p@gmail.com' }, { sentenceStart: true })).toBe('Priya')
    expect(shortName({ name: null, email: 'sam@gmail.com' })).toBe('sam')
  })
})
