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
})
