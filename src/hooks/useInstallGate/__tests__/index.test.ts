// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Platform } from '../../../pwa/platform.ts'
import { useInstall } from '../../useInstall'
import { useInstallGate } from '../index.ts'

const config = vi.hoisted(() => ({ requireInstall: true }))

vi.mock('../../../config.ts', () => ({
  get REQUIRE_INSTALL() {
    return config.requireInstall
  },
}))
vi.mock('../../useInstall', () => ({ useInstall: vi.fn() }))

function gatedFor(platform: Platform, { installed = false, skipped = false } = {}) {
  vi.mocked(useInstall).mockReturnValue({
    platform,
    installed,
    skipped,
    canPrompt: false,
    promptInstall: vi.fn(),
    skipInstall: vi.fn(),
  })
  return renderHook(() => useInstallGate()).result.current.gated
}

describe('useInstallGate', () => {
  afterEach(() => {
    config.requireInstall = true
  })

  it('locks getting started behind installing on iPhone and iPad', () => {
    expect(gatedFor('ios')).toBe(true)
  })

  it('does not lock it on Android or desktop', () => {
    expect(gatedFor('android')).toBe(false)
    expect(gatedFor('desktop')).toBe(false)
  })

  it('does not lock it once the app is installed', () => {
    expect(gatedFor('ios', { installed: true })).toBe(false)
  })

  it('does not lock it once the visitor chose to continue in the browser', () => {
    expect(gatedFor('ios', { skipped: true })).toBe(false)
  })

  it('does not lock it when the requirement is switched off (VITE_REQUIRE_INSTALL=false)', () => {
    config.requireInstall = false
    expect(gatedFor('ios')).toBe(false)
  })

  it('passes on what useInstall says', () => {
    vi.mocked(useInstall).mockReturnValue({
      platform: 'ios',
      installed: false,
      skipped: false,
      canPrompt: true,
      promptInstall: vi.fn(),
      skipInstall: vi.fn(),
    })
    expect(renderHook(() => useInstallGate()).result.current).toMatchObject({ platform: 'ios', canPrompt: true, gated: true })
  })
})
