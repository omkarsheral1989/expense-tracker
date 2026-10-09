import { LAKH_GROUPED_CURRENCIES, MAX_AMOUNT } from './constants.ts'

/**
 * The locale whose digit grouping a currency is written with. Only grouping
 * and symbols come from it; the decimal mark is always ".".
 */
function groupingLocale(currency: string): string {
  return LAKH_GROUPED_CURRENCIES.includes(currency) ? 'en-IN' : 'en-US'
}

/** How many digits a currency has after the decimal mark: 2 for GBP, 0 for JPY, 3 for KWD. */
function decimals(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2
}

/** Splits a cleaned amount ("1234.5") into its whole and fraction digits. */
function parts(raw: string) {
  const [whole = '', fraction] = raw.split('.')
  return { whole, fraction }
}

/**
 * Keeps what can be part of an amount in this currency: digits and one ".",
 * with no more decimals than the currency has and no leading zeros. Anything
 * else (letters, spaces, the "," separators the field adds itself) is dropped.
 * "1,23,456.789" in GBP becomes "123456.78"; "007" becomes "7"; "." becomes "0.".
 */
function cleanInput(text: string, currency: string): string {
  const places = decimals(currency)
  const kept = text.replace(/[^0-9.]/g, '')
  const point = kept.indexOf('.')
  const wholeDigits = point === -1 ? kept : kept.slice(0, point)
  const whole = wholeDigits.replace(/^0+(?=\d)/, '')

  if (point === -1 || places === 0) return whole
  const fraction = kept.slice(point + 1).replace(/\./g, '').slice(0, places)
  return `${whole || '0'}.${fraction}`
}

/**
 * A cleaned amount with its thousands separators, as the field shows it while
 * the user types: "123456.5" is "1,23,456.5" in INR and "123,456.5" in GBP. A
 * trailing "." or zeros are kept, so typing is never undone.
 */
function formatInput(raw: string, currency: string): string {
  const { whole, fraction } = parts(raw)
  if (whole === '') return raw
  const grouped = new Intl.NumberFormat(groupingLocale(currency), {
    maximumFractionDigits: 0,
  }).format(BigInt(whole))
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/**
 * A cleaned amount in minor units of the currency ("12.5" GBP is 1250), or
 * null when there are no digits. Digits beyond the currency's decimals are
 * rounded, half up ("12.345" GBP is 1235).
 */
function toMinor(raw: string, currency: string): number | null {
  const { whole, fraction = '' } = parts(raw)
  if (!/\d/.test(raw)) return null
  const places = decimals(currency)
  const kept = fraction.padEnd(places, '0').slice(0, places)
  const roundUp = Number(fraction[places] ?? '0') >= 5 ? 1 : 0
  return Number(`${whole || '0'}${kept}`) + roundUp
}

/** Minor units as a plain amount with all its decimals: 1250 GBP is "12.50", 1250 JPY is "1250". */
function fromMinor(minor: number, currency: string): string {
  const places = decimals(currency)
  if (places === 0) return String(minor)
  const digits = String(minor).padStart(places + 1, '0')
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`
}

/**
 * Fits an amount typed for one currency to another: rounded when the new one
 * has fewer decimals ("12.345" in KWD becomes "12.35" in GBP and "12" in JPY),
 * unchanged when it already fits.
 */
function convertInput(raw: string, currency: string): string {
  const { fraction } = parts(raw)
  const places = decimals(currency)
  if (fraction === undefined || fraction.length <= places) return raw
  const minor = toMinor(raw, currency)
  return minor === null ? raw : fromMinor(minor, currency)
}

/** An amount for reading, with the currency's symbol and grouping: "₹1,23,456.50", "£12.00". */
function format(minor: number, currency: string): string {
  const places = decimals(currency)
  return new Intl.NumberFormat(groupingLocale(currency), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minor / 10 ** places)
}

/** The largest amount an expense can have in this currency, in minor units. */
function maxMinor(currency: string): number {
  return MAX_AMOUNT * 10 ** decimals(currency)
}

/** "0.00" in GBP, "0" in JPY: what an empty amount field shows. */
function placeholder(currency: string): string {
  return fromMinor(0, currency)
}

/**
 * Amounts of money: reading and writing them in a currency's own decimals,
 * always in whole minor units, with "." as the only decimal mark.
 */
export const moneyService = {
  maxAmount: MAX_AMOUNT,
  decimals,
  cleanInput,
  formatInput,
  toMinor,
  fromMinor,
  convertInput,
  format,
  maxMinor,
  placeholder,
}
