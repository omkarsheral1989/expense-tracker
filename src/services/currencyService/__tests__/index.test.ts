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

describe('currencyService.forLocales', () => {
  it('finds the currency of the language\'s region', () => {
    expect(currencyService.forLocales(['en-IN'])).toBe('INR')
    expect(currencyService.forLocales(['de-DE'])).toBe('EUR')
    expect(currencyService.forLocales(['en-US'])).toBe('USD')
    expect(currencyService.forLocales(['ja-JP'])).toBe('JPY')
  })

  it('uses the first language that names a region', () => {
    expect(currencyService.forLocales(['en', 'en-GB'])).toBe('GBP')
    expect(currencyService.forLocales(['en-IN', 'en-US'])).toBe('INR')
  })

  it('falls back to the likely region of a language without one', () => {
    expect(currencyService.forLocales(['en'])).toBe('USD')
    expect(currencyService.forLocales(['hi'])).toBe('INR')
  })

  it('returns null when it cannot tell', () => {
    expect(currencyService.forLocales([])).toBeNull()
    expect(currencyService.forLocales(['not a locale'])).toBeNull()
  })

  it('skips an invalid language and carries on', () => {
    expect(currencyService.forLocales(['???', 'en-IN'])).toBe('INR')
  })
})

describe('currencyService.options', () => {
  it('labels each currency with its code, name and symbol', () => {
    const options = currencyService.options('en')
    expect(options.find((option) => option.value === 'INR')?.label).toBe(
      'INR – Indian Rupee (₹)',
    )
    expect(options.find((option) => option.value === 'USD')?.label).toBe(
      'USD – US Dollar ($)',
    )
  })

  it('leaves the symbol out when a currency has none of its own', () => {
    const label = currencyService.options('en').find((option) => option.value === 'CHF')?.label
    expect(label).toBe('CHF – Swiss Franc')
  })

  it('offers every currency once, sorted by code', () => {
    const options = currencyService.options('en')
    const values = options.map((option) => option.value)
    expect(values).toEqual(currencyService.codes().toSorted())
    expect(new Set(values).size).toBe(values.length)
  })

  it('puts the chosen currency first and keeps the rest in order', () => {
    const values = currencyService.options('en', 'INR').map((option) => option.value)
    expect(values[0]).toBe('INR')
    expect(values.slice(1)).toEqual(
      currencyService.codes().toSorted().filter((code) => code !== 'INR'),
    )
  })

  it('ignores a first currency that does not exist', () => {
    const values = currencyService.options('en', 'ZZZ').map((option) => option.value)
    expect(values).toEqual(currencyService.codes().toSorted())
  })
})
