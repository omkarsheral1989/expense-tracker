import { describe, expect, it } from 'vitest'
import { detectPlatform } from '../platform.ts'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

describe('detectPlatform', () => {
  it('detects iPhone in Safari and in Chrome', () => {
    expect(detectPlatform({ userAgent: IPHONE })).toBe('ios')
    expect(detectPlatform({ userAgent: IPHONE_CHROME })).toBe('ios')
  })

  it('detects iPadOS, which reports itself as a touch-screen Mac', () => {
    expect(
      detectPlatform({
        userAgent: MAC_SAFARI,
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('ios')
  })

  it('treats a real Mac as desktop', () => {
    expect(
      detectPlatform({
        userAgent: MAC_SAFARI,
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe('desktop')
  })

  it('detects Android and Windows', () => {
    expect(detectPlatform({ userAgent: ANDROID })).toBe('android')
    expect(detectPlatform({ userAgent: WINDOWS })).toBe('desktop')
  })
})
