import { describe, expect, it } from 'vitest'
import { shadeGradient } from '../utils.ts'

describe('shadeGradient', () => {
  it('veils both sides and leaves the column and a 28 px gap on each side clear', () => {
    // 720 / 2 + 28 = 388 px each side of the center.
    expect(shadeGradient(720, 'light')).toBe(
      'linear-gradient(to right, rgba(0, 0, 0, 0.07) calc(50% - 388px), transparent calc(50% - 388px), transparent calc(50% + 388px), rgba(0, 0, 0, 0.07) calc(50% + 388px))',
    )
  })

  it('follows the column width', () => {
    expect(shadeGradient(400, 'light')).toContain('calc(50% - 228px)')
    expect(shadeGradient(400, 'light')).toContain('calc(50% + 228px)')
  })

  it('is darker in dark mode', () => {
    expect(shadeGradient(720, 'dark')).toContain('rgba(0, 0, 0, 0.25)')
    expect(shadeGradient(720, 'dark')).not.toContain('0.07')
  })
})
