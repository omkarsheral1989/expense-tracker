// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrandLogo } from '../index.tsx'

function tile(container: HTMLElement) {
  return container.firstElementChild as HTMLElement
}

describe('BrandLogo', () => {
  afterEach(cleanup)

  it('draws the wallet of the app icon, in the size given, and is hidden from screen readers', () => {
    const { container } = render(<BrandLogo size={56} />)

    expect(tile(container)).toHaveAttribute('aria-hidden', 'true')
    expect(tile(container)).toHaveStyle({ width: '56px', height: '56px' })
    const svg = container.querySelector('svg') as SVGElement
    expect(svg).toHaveAttribute('viewBox', '0 0 512 512')
    // The same two rounded rectangles and dot as public/logo.svg.
    expect(svg.querySelectorAll('rect')).toHaveLength(2)
    expect(svg.querySelector('rect[width="256"][height="176"]')).not.toBeNull()
    expect(svg.querySelector('circle')).not.toBeNull()
  })

  it('uses the app icon\'s gradient and its own wallet size by default', () => {
    const { container } = render(<BrandLogo />)

    expect(tile(container).style.background).toContain('rgb(52, 211, 153)')
    expect(container.querySelector('svg g[transform]')).toBeNull()
  })

  it('takes the lighter greens of the installed icon and a bigger wallet on a green background', () => {
    const { container } = render(<BrandLogo size={56} onPrimary />)

    expect(tile(container).style.background).toContain('rgb(20, 159, 139)')
    expect(tile(container).style.background).toContain('rgb(48, 202, 152)')
    expect(container.querySelector('svg g[transform]')?.getAttribute('transform')).toContain('scale(1.2)')
  })
})
