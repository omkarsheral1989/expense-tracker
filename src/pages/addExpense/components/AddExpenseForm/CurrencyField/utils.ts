/**
 * The font size that fits a currency button's text in its 40 px square: large
 * for a one-character symbol ('$'), smaller for a longer one ('CA$') and
 * smallest for a code ('CHF').
 */
export function labelFontSize(label: string): number {
  if (label.length === 1) return 18
  if (label.length <= 3 && !/^[A-Z]{3}$/.test(label)) return 14
  return 12
}
