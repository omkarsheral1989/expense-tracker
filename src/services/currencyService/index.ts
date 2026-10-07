// The browser's own list of ISO 4217 currency codes, read once on first use.
let cachedCodes: string[] | null = null

function codes(): string[] {
  cachedCodes ??= Intl.supportedValuesOf('currency')
  return cachedCodes
}

export const currencyService = {
  /** Every ISO 4217 currency code the browser knows, such as 'INR' and 'USD'. */
  codes,

  /** Whether `code` is a real, upper-case currency code. */
  isValid: (code: string): boolean => codes().includes(code),
}
