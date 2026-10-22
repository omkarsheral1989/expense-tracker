// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupTypeBackground } from '../index.tsx'

function washColor() {
  return (document.querySelector('div[aria-hidden="true"]') as HTMLElement).style.backgroundColor
}

describe('GroupTypeBackground', () => {
  afterEach(cleanup)

  it.each([
    ['home', 'rgb(212, 107, 8)'],
    ['couple', 'rgb(196, 29, 127)'],
    ['other', 'rgb(54, 79, 199)'],
  ] as const)('washes the page with the %s type\'s own color', (type, color) => {
    render(<GroupTypeBackground type={type} />)

    expect(washColor()).toContain(color)
  })

  it('leans bluer for a trip, since its cyan would read green on a near-black page', () => {
    render(<GroupTypeBackground type="trip" />)

    expect(washColor()).toContain('rgb(14, 165, 233)')
  })
})
