import { CATEGORY_KEYWORDS, DEFAULT_CATEGORY, SETTLEMENT_CATEGORY } from './constants.ts'
import { CATEGORIES } from './utils.ts'
import type { PastCategoryChoice } from './types.ts'

/** Words too common to tell two descriptions apart. */
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'at', 'in', 'on', 'of', 'to', 'a', 'an', 'my', 'our', 'bill', 'payment', 'paid'])

/** How much of the typed words a past description must share to beat the keywords (0 to 1). */
const LEARNED_STRONG_SCORE = 0.5

/** Lower-case words of a text, plural "s" removed ("movies" and "movie" are one word). */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
}

/** Shortest word (letters) that may be typed with one slip ("subsription"); shorter ones must be exact. */
const FUZZY_MIN_LENGTH = 6

/** Whether two words are equal, or, for a long word, one letter apart (one letter changed, added or missing). */
function sameWord(typed: string, wanted: string): boolean {
  if (typed === wanted) return true
  if (wanted.length < FUZZY_MIN_LENGTH || typed.length < FUZZY_MIN_LENGTH || Math.abs(typed.length - wanted.length) > 1) return false
  let i = 0
  while (i < typed.length && i < wanted.length && typed[i] === wanted[i]) i++
  const rest = (word: string, from: number) => word.slice(from)
  return (
    rest(typed, i + 1) === rest(wanted, i + 1) || // one letter changed
    rest(typed, i + 1) === rest(wanted, i) || // one extra letter typed
    rest(typed, i) === rest(wanted, i + 1) // one letter missing
  )
}

/** The words of a description that tell it apart from others: not filler words, and not a lone letter (the "s" of "Priya's"). */
function distinctiveWords(text: string): Set<string> {
  return new Set(wordsOf(text).filter((word) => word.length > 1 && !STOP_WORDS.has(word)))
}

/** Whether `phrase` appears in `words` as consecutive words. */
function containsPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false
  for (let start = 0; start + phrase.length <= words.length; start++) {
    if (phrase.every((word, offset) => sameWord(words[start + offset], word))) return true
  }
  return false
}

/** Each category's phrases: its keywords and its label (the generic "Other" and "General" excluded). */
const CATEGORY_PHRASES = CATEGORIES.filter(
  (category) => category.key !== DEFAULT_CATEGORY && category.key !== SETTLEMENT_CATEGORY,
).map((category) => ({
  key: category.key,
  phrases: [...(CATEGORY_KEYWORDS[category.key] ?? []), ...(category.label === 'Other' ? [] : [category.label])].map(wordsOf),
}))

/**
 * The category the user chose before for a similar description: the past
 * choice sharing the most distinctive words with `description` (the same
 * description shares all of them), the newest on a tie, with its score from
 * 0 to 1. `past` is newest first. Null when none shares a word.
 */
export function categoryFromHistory(
  description: string,
  past: readonly PastCategoryChoice[],
): { category: string; score: number } | null {
  const wanted = distinctiveWords(description)
  if (wanted.size === 0) return null
  let best: { category: string; score: number } | null = null
  for (const choice of past) {
    const own = distinctiveWords(choice.description)
    let shared = 0
    for (const word of wanted) if (own.has(word)) shared++
    // Everything in the typed text found in the past one (or the other way round) is a strong match.
    const score = shared === 0 ? 0 : shared / Math.max(wanted.size, own.size)
    if (score > 0 && (best === null || score > best.score)) best = { category: choice.category, score }
  }
  return best
}

/**
 * The category the built-in keywords and labels point to for a description:
 * the one with the longest phrase found in it as whole words. Null when none.
 */
export function categoryFromKeywords(description: string): string | null {
  const words = wordsOf(description)
  let best: { key: string; length: number } | null = null
  for (const { key, phrases } of CATEGORY_PHRASES) {
    for (const phrase of phrases) {
      const length = phrase.join(' ').length
      if (containsPhrase(words, phrase) && (best === null || length > best.length)) best = { key, length }
    }
  }
  return best?.key ?? null
}

/**
 * The category to pick for a description typed in the add-expense form (PRD 5.5):
 * what the user chose before for a similar description, else the keywords.
 * Null when nothing fits.
 */
export function suggestCategory(description: string, past: readonly PastCategoryChoice[]): string | null {
  const learned = categoryFromHistory(description, past)
  const keyword = categoryFromKeywords(description)
  // A weak overlap ("dinner at Priya's" and "Priya's birthday gift") does not beat a clear keyword.
  if (learned && (learned.score >= LEARNED_STRONG_SCORE || keyword === null)) return learned.category
  return keyword
}
