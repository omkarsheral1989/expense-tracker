import { describe, expect, it } from 'vitest'
import { MEMBER_COLORS, memberColor } from '../memberColors.ts'

describe('memberColor', () => {
  it('gives each of the first members a color of their own', () => {
    expect(new Set(MEMBER_COLORS).size).toBe(MEMBER_COLORS.length)
    expect(MEMBER_COLORS.map((_, index) => memberColor(index))).toEqual([...MEMBER_COLORS])
  })

  it('starts with the app\'s own teal for the first member (the user)', () => {
    expect(memberColor(0)).toBe('#0d9488')
  })

  it('starts over when there are more members than colors', () => {
    expect(memberColor(MEMBER_COLORS.length)).toBe(memberColor(0))
    expect(memberColor(MEMBER_COLORS.length + 3)).toBe(memberColor(3))
  })

  it('gives valid hex colors', () => {
    for (const color of MEMBER_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})
