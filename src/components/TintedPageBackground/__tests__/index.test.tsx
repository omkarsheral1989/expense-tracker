// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TintedPageBackground } from '../index.tsx'

function wash() {
  return document.querySelector('div[aria-hidden="true"]') as HTMLElement
}

function pretendDarkMode(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: dark && query.includes('dark'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

describe('TintedPageBackground', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('is a fixed layer behind the page that fades when its color changes', () => {
    render(<TintedPageBackground color="#0d9488" />)

    expect(wash()).toHaveStyle({ position: 'fixed', zIndex: '-1', pointerEvents: 'none', transition: 'background-color 400ms ease' })
  })

  it('mixes 10% of the color into the page in light mode', () => {
    pretendDarkMode(false)
    render(<TintedPageBackground color="#0d9488" />)

    expect(wash().style.backgroundColor).toContain('rgb(13, 148, 136) 10%')
  })

  it('mixes 20% of the color into the page in dark mode, where less would hardly show', () => {
    pretendDarkMode(true)
    render(<TintedPageBackground color="#0d9488" />)

    expect(wash().style.backgroundColor).toContain('rgb(13, 148, 136) 20%')
  })
})
