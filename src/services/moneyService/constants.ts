/** The largest amount an expense can have, in major units (one billion). */
export const MAX_AMOUNT = 1_000_000_000

/**
 * Currencies grouped in lakhs and crores (1,23,45,678) instead of thousands
 * (12,345,678). Everything else uses western grouping.
 */
export const LAKH_GROUPED_CURRENCIES: readonly string[] = ['INR']
