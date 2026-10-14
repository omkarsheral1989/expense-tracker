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

  it('has no shadow on a plain background', () => {
    render(<GroupTypeIcon type="trip" />)

    expect(screen.getByRole('img', { name: 'Trip' }).style.boxShadow).toBe('')
  })

  it('has a soft shadow when raised, for a background of its own color', () => {
    render(<GroupTypeIcon type="trip" raised />)

    expect(screen.getByRole('img', { name: 'Trip' })).toHaveStyle({
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)',
    })
  })
})
