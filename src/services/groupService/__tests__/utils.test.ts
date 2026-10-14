import { describe, expect, it } from 'vitest'
import { displayName, shortName } from '../utils.ts'

describe('shortName', () => {
  it.each([
    [{ name: 'Priya Shah', email: 'priya@gmail.com' }, 'Priya'],
    [{ name: '  Sam  ', email: 'sam@gmail.com' }, 'Sam'],
    [{ name: null, email: 'ana.k@gmail.com' }, 'Ana.k'],
    [{ name: '   ', email: 'ana.k@gmail.com' }, 'Ana.k'],
    [{ name: 'Rahul Rao', email: null }, 'Rahul'],
    [{ name: null, email: null }, 'Someone'],
  ])('names %j as %j', (person, name) => {
    expect(shortName(person)).toBe(name)
  })
})

describe('displayName', () => {
  it('is the name, else the email, else "Someone"', () => {
    expect(displayName({ name: 'Priya Shah', email: 'priya@gmail.com' })).toBe('Priya Shah')
    expect(displayName({ name: null, email: 'priya@gmail.com' })).toBe('priya@gmail.com')
    expect(displayName({ name: 'Rahul', email: null })).toBe('Rahul')
    expect(displayName({ name: null, email: null })).toBe('Someone')
  })
})
