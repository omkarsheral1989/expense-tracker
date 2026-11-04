// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SideShade } from '../index.tsx'

describe('SideShade', () => {
  afterEach(cleanup)

  it('is a fixed layer over the screen that lets clicks through and is hidden from screen readers', () => {
    render(<SideShade columnWidth={720} />)
    const shade = document.querySelector('[data-side-shade]') as HTMLElement

    expect(shade).toHaveStyle({ position: 'fixed', pointerEvents: 'none' })
    expect(shade).toHaveAttribute('aria-hidden', 'true')
  })
})
