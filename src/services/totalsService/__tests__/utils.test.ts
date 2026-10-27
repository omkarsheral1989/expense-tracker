import { describe, expect, it } from 'vitest'
import { orderCurrencies, percentOf, sortRows } from '../utils.ts'

const row = (personId: string, name: string | null, amountMinor: number, email: string | null = null) => ({
  personId,
  name,
  email,
  picture: null,
  isYou: false,
  amountMinor,
})

describe('sortRows', () => {
  it('puts the largest amount first', () => {
    expect(sortRows([row('a', 'Ann', 100), row('b', 'Bob', 300), row('c', 'Cy', 200)]).map((one) => one.name)).toEqual(['Bob', 'Cy', 'Ann'])
  })

  it('breaks a tie by the name shown, ignoring case, then by id', () => {
    expect(sortRows([row('1', 'zed', 100), row('2', 'Amy', 100), row('3', 'bob', 100)]).map((one) => one.name)).toEqual(['Amy', 'bob', 'zed'])
    expect(sortRows([row('b', 'Sam', 100), row('a', 'Sam', 100)]).map((one) => one.personId)).toEqual(['a', 'b'])
  })

  it('uses the email when a person has no name, and puts those with nothing last', () => {
    const sorted = sortRows([row('1', null, 0, 'amy@gmail.com'), row('2', 'Zoe', 50), row('3', null, 50, 'bob@gmail.com')])
    expect(sorted.map((one) => one.personId)).toEqual(['3', '2', '1'])
  })

  it('does not change the list it was given', () => {
    const rows = [row('a', 'Ann', 1), row('b', 'Bob', 2)]
    sortRows(rows)
    expect(rows.map((one) => one.name)).toEqual(['Ann', 'Bob'])
  })
})

describe('orderCurrencies', () => {
  it('puts the group\'s default first and the rest A to Z', () => {
    expect(orderCurrencies(['USD', 'EUR', 'GBP', 'AUD'], 'GBP')).toEqual(['GBP', 'AUD', 'EUR', 'USD'])
  })

  it('puts them all A to Z when the default is not among them', () => {
    expect(orderCurrencies(['USD', 'EUR'], 'GBP')).toEqual(['EUR', 'USD'])
  })

  it('does not change the list it was given', () => {
    const list = ['USD', 'EUR']
    orderCurrencies(list, 'EUR')
    expect(list).toEqual(['USD', 'EUR'])
  })
})

describe('percentOf', () => {
  it('gives a whole percent of the total, rounded', () => {
    expect(percentOf(300, 500)).toBe(60)
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(2, 3)).toBe(67)
    expect(percentOf(500, 500)).toBe(100)
  })

  it('is 0 for nothing, and when there is no total', () => {
    expect(percentOf(0, 500)).toBe(0)
    expect(percentOf(100, 0)).toBe(0)
  })
})
