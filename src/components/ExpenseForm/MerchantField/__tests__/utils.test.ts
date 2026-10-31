import { describe, expect, it } from 'vitest'
import { matchingMerchants } from '../utils.ts'

const NAMES = ['Blinkit', 'Astha Medico', 'Apollo Pharmacy', '1mg']

describe('matchingMerchants', () => {
  it('lists every name when nothing is typed', () => {
    expect(matchingMerchants(NAMES, '')).toEqual(NAMES)
    expect(matchingMerchants(NAMES, '   ')).toEqual(NAMES)
  })

  it('matches the start of any word, ignoring case', () => {
    expect(matchingMerchants(NAMES, 'bl')).toEqual(['Blinkit'])
    expect(matchingMerchants(NAMES, 'MEDI')).toEqual(['Astha Medico'])
    expect(matchingMerchants(NAMES, 'pharm')).toEqual(['Apollo Pharmacy'])
  })

  it('needs every typed word to start a word of the name', () => {
    expect(matchingMerchants(NAMES, 'a p')).toEqual(['Apollo Pharmacy'])
    expect(matchingMerchants(NAMES, 'apollo medico')).toEqual([])
  })

  it('does not match the middle of a word', () => {
    expect(matchingMerchants(NAMES, 'ink')).toEqual([])
  })

  it('leaves out a name that is already fully typed', () => {
    expect(matchingMerchants(NAMES, 'blinkit')).toEqual([])
    expect(matchingMerchants(NAMES, '  BLINKIT ')).toEqual([])
  })
})
