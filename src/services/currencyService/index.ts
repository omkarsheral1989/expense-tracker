import countryToCurrency from 'country-to-currency'
import type { CurrencyOption } from './types.ts'

// The browser's own list of ISO 4217 currency codes, read once on first use.
let cachedCodes: string[] | null = null

function codes(): string[] {
  cachedCodes ??= Intl.supportedValuesOf('currency')
  return cachedCodes
}

function isValid(code: string): boolean {
  return codes().includes(code)
}

/** The region of a locale such as 'en-IN', or null when it has none ('en'). */
function explicitRegion(locale: string): string | null {
  try {
    return new Intl.Locale(locale).region ?? null
  } catch {
    return null // not a valid locale tag
  }
}

/**
 * The currency symbol for a code in a locale ('₹'), or null when it has none.
 * The narrow form is the shortest ('$' for every dollar); the regular form
 * tells currencies apart ('CA$' in a locale where '$' is another dollar).
 */
function symbolOf(
  code: string,
  locale: string,
  display: 'narrowSymbol' | 'symbol' = 'narrowSymbol',
): string | null {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: display,
  }).formatToParts(0)
  const symbol = parts.find((part) => part.type === 'currency')?.value
  return symbol && symbol !== code ? symbol : null
}

export const currencyService = {
  /** Every ISO 4217 currency code the browser knows, such as 'INR' and 'USD'. */
  codes,

  /** Whether `code` is a real, upper-case currency code. */
  isValid,

  /**
   * A symbol that tells the currency apart in a locale ('$' for USD, 'CA$' for
   * CAD in 'en-US', '฿' for THB), or null when there is none (then use the
   * code). It is the locale's regular symbol; failing that, the short form
   * when no other currency shares it (never a bare '$' for SGD or 'kr' for SEK).
   */
  symbol(code: string, locale: string): string | null {
    const regular = symbolOf(code, locale, 'symbol')
    if (regular) return regular
    const narrow = symbolOf(code, locale)
    return narrow && narrowSymbolCounts(locale).get(narrow) === 1 ? narrow : null
  },

  /**
   * The currency of the user's region, worked out from their preferred
   * languages (`navigator.languages`). The first language that names a region
   * ('en-IN') decides; if none does, the likely region of the first language is
   * used ('en' becomes the US). Null when nothing matches.
   */
  forLocales(locales: readonly string[]): string | null {
    const guess = locales.find((locale) => explicitRegion(locale) !== null)
    const region =
      (guess && explicitRegion(guess)) ??
      (locales[0] ? maximizedRegion(locales[0]) : null)

    const code = region
      ? (countryToCurrency as Record<string, string | undefined>)[region]
      : undefined
    return code && isValid(code) ? code : null
  },

  /** One currency's full picker label in the user's language ('GBP – British Pound (£)'), or the code itself when it is unknown. */
  label(code: string, locale: string): string {
    return optionsFor(locale).find((option) => option.value === code)?.label ?? code
  },

  /**
   * Every currency as a picker entry, labelled in the user's language and
   * sorted by code. `firstCode`, when given, is moved to the top.
   */
  options(locale: string, firstCode?: string | null): CurrencyOption[] {
    const options = optionsFor(locale)

    const first = options.find((option) => option.value === firstCode)
    // A new array each time, so a caller cannot change the cached list.
    return first
      ? [first, ...options.filter((option) => option !== first)]
      : [...options]
  },
}

// How many currencies use each short symbol in a locale ('$' many, '฿' one),
// counted once per locale.
const cachedSymbolCounts = new Map<string, Map<string, number>>()

function narrowSymbolCounts(locale: string): Map<string, number> {
  const cached = cachedSymbolCounts.get(locale)
  if (cached) return cached

  const counts = new Map<string, number>()
  for (const code of codes()) {
    const symbol = symbolOf(code, locale)
    if (symbol) counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  }
  cachedSymbolCounts.set(locale, counts)
  return counts
}

// Building every label formats a few hundred currencies, so each locale's
// list is made once and reused.
const cachedOptions = new Map<string, CurrencyOption[]>()

function optionsFor(locale: string): CurrencyOption[] {
  const cached = cachedOptions.get(locale)
  if (cached) return cached

  const names = new Intl.DisplayNames([locale], { type: 'currency' })
  const options = codes()
    .toSorted()
    .map((code) => {
      const symbol = symbolOf(code, locale)
      const name = names.of(code) ?? code
      return {
        value: code,
        label: `${code} – ${name}${symbol ? ` (${symbol})` : ''}`,
      }
    })
  cachedOptions.set(locale, options)
  return options
}

function maximizedRegion(locale: string): string | null {
  try {
    return new Intl.Locale(locale).maximize().region ?? null
  } catch {
    return null
  }
}
