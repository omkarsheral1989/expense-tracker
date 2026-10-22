import { describe, expect, it } from 'vitest'
import { aboveScreenEdge, belowStatusBar } from '../safeArea.ts'

describe('safe-area padding', () => {
  it('adds the space the device keeps free at the bottom to what a sheet wants there', () => {
    expect(aboveScreenEdge(16)).toBe('calc(16px + env(safe-area-inset-bottom))')
  })

  it('adds the space the device keeps free at the top to what a page wants there', () => {
    expect(belowStatusBar(32)).toBe('calc(32px + env(safe-area-inset-top))')
  })
})
