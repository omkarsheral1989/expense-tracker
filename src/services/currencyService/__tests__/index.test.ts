import { describe, expect, it } from 'vitest'
import { currencyService } from '../index.ts'

describe('currencyService', () => {
  it('lists the ISO currency codes the browser knows', () => {
    const codes = currencyService.codes()
    expect(codes).toEqual(expect.arrayContaining(['INR', 'USD', 'EUR', 'JPY']))
    expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true)
  })

  it('accepts a real currency code', () => {
    expect(currencyService.isValid('INR')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const code of ['inr', 'XYZZ', 'ZZZ', '', ' INR', 'Rupee']) {
      expect(currencyService.isValid(code)).toBe(false)
    }
  })
})
