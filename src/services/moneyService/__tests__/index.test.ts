import { describe, expect, it } from 'vitest'
import { moneyService } from '../index.ts'

describe('moneyService', () => {
  describe('decimals', () => {
    it.each([
      ['GBP', 2],
      ['INR', 2],
      ['JPY', 0],
      ['KWD', 3],
    ])('%s has %i', (currency, places) => {
      expect(moneyService.decimals(currency)).toBe(places)
    })
  })

  describe('cleanInput', () => {
    it.each([
      ['', ''],
      ['12', '12'],
      ['1,23,456.78', '123456.78'],
      ['12.345', '12.34'],
      ['007', '7'],
      ['0', '0'],
      ['00.5', '0.5'],
      ['.', '0.'],
      ['.5', '0.5'],
      ['12.', '12.'],
      ['12.50', '12.50'],
      ['1.2.3', '1.23'],
      ['12,5', '125'],
      ['abc 1 2', '12'],
      ['-5', '5'],
    ])('keeps %j as %j in GBP', (text, raw) => {
      expect(moneyService.cleanInput(text, 'GBP')).toBe(raw)
    })

    it('keeps only the whole part for a currency without decimals', () => {
      expect(moneyService.cleanInput('1234.56', 'JPY')).toBe('1234')
      // Typed one key at a time, the "." is dropped and the next digit follows.
      expect(moneyService.cleanInput('1234.', 'JPY')).toBe('1234')
    })

    it('allows three decimals for a currency that has them', () => {
      expect(moneyService.cleanInput('1.2345', 'KWD')).toBe('1.234')
    })
  })

  describe('formatInput', () => {
    it.each([
      ['', ''],
      ['5', '5'],
      ['1234', '1,234'],
      ['123456', '1,23,456'],
      ['12345678.5', '1,23,45,678.5'],
      ['1000.', '1,000.'],
      ['0.50', '0.50'],
    ])('groups %j in lakhs for INR as %j', (raw, shown) => {
      expect(moneyService.formatInput(raw, 'INR')).toBe(shown)
    })

    it.each([
      ['123456', '123,456'],
      ['12345678.5', '12,345,678.5'],
      ['1000.', '1,000.'],
    ])('groups %j in thousands for GBP as %j', (raw, shown) => {
      expect(moneyService.formatInput(raw, 'GBP')).toBe(shown)
    })

    it('reads back what it shows', () => {
      const shown = moneyService.formatInput('12345678.9', 'INR')
      expect(moneyService.cleanInput(shown, 'INR')).toBe('12345678.9')
    })
  })

  describe('toMinor', () => {
    it.each([
      ['', 'GBP', null],
      ['0.', 'GBP', 0],
      ['12', 'GBP', 1200],
      ['12.5', 'GBP', 1250],
      ['12.05', 'GBP', 1205],
      ['0.01', 'GBP', 1],
      ['12.345', 'GBP', 1235],
      ['12.344', 'GBP', 1234],
      ['12.995', 'GBP', 1300],
      ['1500', 'JPY', 1500],
      ['1.5', 'JPY', 2],
      ['1.2345', 'KWD', 1235],
      ['1000000000', 'INR', 100_000_000_000],
    ] as const)('reads %j %s as %j', (raw, currency, minor) => {
      expect(moneyService.toMinor(raw, currency)).toBe(minor)
    })
  })

  describe('fromMinor', () => {
    it.each([
      [1250, 'GBP', '12.50'],
      [5, 'GBP', '0.05'],
      [0, 'GBP', '0.00'],
      [1250, 'JPY', '1250'],
      [1, 'KWD', '0.001'],
    ] as const)('writes %i %s as %j', (minor, currency, raw) => {
      expect(moneyService.fromMinor(minor, currency)).toBe(raw)
    })
  })

  describe('convertInput', () => {
    it.each([
      ['12.345', 'GBP', '12.35'],
      ['12.344', 'GBP', '12.34'],
      ['12.5', 'JPY', '13'],
      ['12.4', 'JPY', '12'],
      ['12.5', 'GBP', '12.5'],
      ['12', 'KWD', '12'],
      ['', 'JPY', ''],
    ] as const)('fits %j to %s as %j', (raw, currency, fitted) => {
      expect(moneyService.convertInput(raw, currency)).toBe(fitted)
    })
  })

  describe('format', () => {
    it.each([
      [12345650, 'INR', '₹1,23,456.50'],
      [1200, 'GBP', '£12.00'],
      [123456789, 'USD', '$1,234,567.89'],
      [1500, 'JPY', '¥1,500'],
      [1234, 'KWD', 'KWD 1.234'],
    ] as const)('shows %i %s as %j', (minor, currency, shown) => {
      // Intl may use a non-breaking space between a code and the number.
      expect(moneyService.format(minor, currency).replace(/\s/g, ' ')).toBe(shown)
    })
  })

  it('caps an amount at one billion in each currency\'s minor units', () => {
    expect(moneyService.maxMinor('GBP')).toBe(100_000_000_000)
    expect(moneyService.maxMinor('JPY')).toBe(1_000_000_000)
  })

  it('shows an empty amount with the currency\'s decimals', () => {
    expect(moneyService.placeholder('GBP')).toBe('0.00')
    expect(moneyService.placeholder('JPY')).toBe('0')
  })
})
