import { describe, expect, it } from 'vitest'
import { bandBackground } from '../bandBackground.ts'

describe('bandBackground', () => {
  it('is a diagonal gradient from the color to a darker shade of it, under two faint circles', () => {
    const background = bandBackground('#0891b2')

    expect(background).toContain('linear-gradient(160deg, #0891b2, color-mix(in srgb, #0891b2 68%, black))')
    expect(background.match(/radial-gradient/g)).toHaveLength(2)
  })
})
