// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupTypeIcon } from '../index.tsx'

describe('GroupTypeIcon', () => {
  afterEach(cleanup)

  it('is a tile named for the type, in the size given', () => {
    render(<GroupTypeIcon type="home" size={48} />)

    const tile = screen.getByRole('img', { name: 'Home' })
    expect(tile).toHaveStyle({ width: '48px', height: '48px' })
  })

  it.each([
    ['trip', 'car'],
    ['home', 'home'],
    ['couple', 'heart'],
    ['other', 'appstore'],
  ] as const)('shows the %s type with the %s icon', (type, icon) => {
    const { container } = render(<GroupTypeIcon type={type} />)

    expect(container.querySelector(`[data-icon="${icon}"]`)).not.toBeNull()
  })
})
