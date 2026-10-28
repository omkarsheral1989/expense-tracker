import { describe, expect, it } from 'vitest'
import { categoryFromHistory, categoryFromKeywords, suggestCategory } from '../suggest.ts'

describe('categoryFromKeywords', () => {
  it.each([
    ['movie', 'entertainment.movies'],
    ['dinner in a restaurant', 'food.dining_out'],
    ['Netflix', 'entertainment.streaming'],
    ['zee5 subscription', 'entertainment.streaming'],
    ['Youtube subscription', 'entertainment.streaming'],
    ['cab to airport', 'transport.taxi'],
    ['car fastag', 'transport.toll'],
    ['petrol', 'transport.fuel'],
    ['flight to Delhi', 'transport.plane'],
    ['electricity bill', 'utilities.electricity'],
    ['Bathroom cleaning', 'utilities.cleaning'],
    ['cook maid', 'home.domestic_help'],
    ['cleaning maid', 'home.domestic_help'],
    ['utensils', 'home.supplies'],
    ['garbage bags', 'home.supplies'],
    ['dishwasher detergent', 'home.supplies'],
    ['selfie stick', 'shopping.gadgets'],
    ['cheesecake', 'food.coffee_snacks'],
    ['mithai', 'food.coffee_snacks'],
    ['milk', 'food.dairy'],
    ['udemy', 'life.courses'],
    ['massage', 'health.wellness'],
  ])('"%s" is %s', (description, key) => {
    expect(categoryFromKeywords(description)).toBe(key)
  })

  it('ignores case and plural endings', () => {
    expect(categoryFromKeywords('MOVIES')).toBe('entertainment.movies')
    expect(categoryFromKeywords('Google Photos')).toBe('entertainment.apps')
  })

  it('takes the longest phrase when several categories fit', () => {
    // "bag" alone is footwear and accessories; "garbage bag" is longer and belongs to household supplies.
    expect(categoryFromKeywords('bag')).toBe('shopping.footwear')
    expect(categoryFromKeywords('garbage bag')).toBe('home.supplies')
  })

  it('matches whole words only', () => {
    // "emi" must not be found inside "chemistry", nor "ac" inside "pace".
    expect(categoryFromKeywords('chemistry')).toBeNull()
    expect(categoryFromKeywords('pace')).toBeNull()
  })

  it('finds a long word with one letter wrong, added or missing', () => {
    expect(categoryFromKeywords('Google photo subsription')).toBe('entertainment.apps')
    expect(categoryFromKeywords('restaurnt')).toBe('food.dining_out')
    expect(categoryFromKeywords('restaurrant')).toBe('food.dining_out')
    expect(categoryFromKeywords('desert')).toBe('food.coffee_snacks')
  })

  it('does not forgive two letters, or a slip in a short word', () => {
    expect(categoryFromKeywords('restarnt')).toBeNull()
    expect(categoryFromKeywords('petrul')).toBe('transport.fuel') // six letters: one slip is allowed
    expect(categoryFromKeywords('movei')).toBeNull() // five letters: exact only
  })

  it('finds nothing for a bare "subscription", words that fit no category, and the default category\'s own words', () => {
    expect(categoryFromKeywords('subscription')).toBeNull()
    expect(categoryFromKeywords('selfie')).toBeNull()
    expect(categoryFromKeywords('general')).toBeNull()
    expect(categoryFromKeywords('other')).toBeNull()
    expect(categoryFromKeywords('')).toBeNull()
  })

  it('finds a category by its own label', () => {
    expect(categoryFromKeywords('Parking')).toBe('transport.parking')
    expect(categoryFromKeywords('water')).toBe('utilities.water')
  })
})

describe('categoryFromHistory', () => {
  const past = [
    { description: 'Rapido to office', category: 'transport.taxi' },
    { description: 'Dinner with Priya', category: 'food.dining_out' },
  ]

  it('finds the category of a past description with the same words, ignoring case', () => {
    expect(categoryFromHistory('rapido TO office', past)).toEqual({ category: 'transport.taxi', score: 1 })
  })

  it('scores a partial overlap by the share of words in common', () => {
    expect(categoryFromHistory('Rapido', past)).toEqual({ category: 'transport.taxi', score: 1 / 2 })
  })

  it('takes the past choice sharing most words, and the newest when equal', () => {
    const choices = [
      { description: 'Lunch Priya', category: 'a' },
      { description: 'Lunch Sam', category: 'b' },
      { description: 'Priya Sam lunch', category: 'c' },
    ]
    expect(categoryFromHistory('lunch priya sam', choices)?.category).toBe('c')
    expect(categoryFromHistory('Lunch', choices)?.category).toBe('a')
  })

  it('does not count filler words', () => {
    expect(categoryFromHistory('the bill for the', past)).toBeNull()
    expect(categoryFromHistory('payment', [{ description: 'Payment', category: 'x' }])).toBeNull()
  })

  it('does not count a lone letter, such as the "s" of a possessive', () => {
    expect(categoryFromHistory("Sam's", [{ description: "Priya's", category: 'x' }])).toBeNull()
  })

  it('finds nothing without a shared word or without history', () => {
    expect(categoryFromHistory('Cinema', past)).toBeNull()
    expect(categoryFromHistory('Rapido', [])).toBeNull()
    expect(categoryFromHistory('', past)).toBeNull()
  })
})

describe('suggestCategory', () => {
  it('uses the keywords when the user has no history', () => {
    expect(suggestCategory('Netflix', [])).toBe('entertainment.streaming')
  })

  it('prefers what the user chose before over the keywords', () => {
    const past = [{ description: 'Netflix', category: 'entertainment.apps' }]
    expect(suggestCategory('Netflix', past)).toBe('entertainment.apps')
  })

  it('does not let a weak overlap beat a clear keyword', () => {
    const past = [{ description: "Priya's birthday gift", category: 'life.gifts' }]
    expect(suggestCategory("dinner at Priya's", past)).toBe('food.dining_out')
  })

  it('uses a weak overlap when no keyword fits', () => {
    const past = [{ description: "Priya's birthday gift", category: 'life.gifts' }]
    expect(suggestCategory('Priya', past)).toBe('life.gifts')
  })

  it('is null when nothing fits', () => {
    expect(suggestCategory('zzzz', [{ description: 'Lunch', category: 'food.dining_out' }])).toBeNull()
  })
})
