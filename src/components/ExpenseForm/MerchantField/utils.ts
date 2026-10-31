/**
 * The suggestions that fit what was typed: every typed word must start a word
 * of the name, ignoring case. Nothing typed lists them all. A name equal to
 * what is typed is left out, since there is nothing left to complete.
 */
export function matchingMerchants(merchants: readonly string[], typed: string): string[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean)
  const typedName = words.join(' ')
  return merchants.filter((merchant) => {
    const name = merchant.toLowerCase()
    if (words.length > 0 && name === typedName) return false
    const nameWords = name.split(/\s+/)
    return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)))
  })
}
