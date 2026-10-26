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

  it('is one rounded, colored tile when it does not travel', () => {
    render(<GroupTypeIcon type="trip" />)

    const tile = screen.getByRole('img', { name: 'Trip' })
    expect(tile).toHaveStyle({ borderRadius: '10px', background: 'rgb(8, 145, 178)' })
    expect(tile.querySelector('[data-vt]')).toBeNull()
  })

  it('is a square colored block in a rounded frame that clips it when it travels, with the block and icon marked (PRD 5.16)', () => {
    render(<GroupTypeIcon type="trip" travels />)

    const frame = screen.getByRole('img', { name: 'Trip' })
    expect(frame).toHaveStyle({ borderRadius: '10px', overflow: 'hidden' })
    const block = frame.querySelector<HTMLElement>('[data-vt="block"]')
    expect(block).toHaveStyle({ background: 'rgb(8, 145, 178)' })
    expect(block?.style.borderRadius).toBe('')
    expect(block?.querySelector('[data-vt="icon"] [data-icon="car"]')).not.toBeNull()
  })
})
