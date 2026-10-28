// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CategoryIcon } from '../index.tsx'

describe('CategoryIcon', () => {
  afterEach(cleanup)

  it('is a tile named for the category, in the color of its group', () => {
    render(<CategoryIcon category="food.delivery" />)

    const tile = screen.getByRole('img', { name: 'Food delivery' })
    expect(tile).toHaveStyle({ width: '40px', height: '40px', background: 'rgb(232, 89, 12)' })
  })

  it('takes the color of the group a category was moved to, whatever its key says', () => {
    render(<CategoryIcon category="home.mortgage" />)

    // Red, the color of Loans and debt, not the green of Home that its key starts with.
    expect(screen.getByRole('img', { name: 'Home loan' })).toHaveStyle({ background: 'rgb(201, 42, 42)' })
  })

  it.each([
    ['investments.ppf', 'Investments', 'rgb(230, 119, 0)'],
    ['health.doctor', 'Health and personal care', 'rgb(9, 146, 104)'],
    ['shopping.books', 'Shopping', 'rgb(174, 62, 201)'],
  ])('is in the color of its new group: %s', (category, _group, color) => {
    render(<CategoryIcon category={category} />)

    expect(screen.getByRole('img')).toHaveStyle({ background: color })
  })

  it('draws a specific icon of its own, such as a pill for medicines', () => {
    render(<CategoryIcon category="health.medicines" />)

    expect(screen.getByRole('img', { name: 'Medicines' }).querySelector('.tabler-icon-pill')).not.toBeNull()
  })

  it('draws the icon at 18 px unless told another size, whatever the size of the tile', () => {
    const { unmount } = render(<CategoryIcon category="general" size={64} />)
    expect(screen.getByRole('img', { name: 'General' })).toHaveStyle({ width: '64px', fontSize: '18px' })
    unmount()

    render(<CategoryIcon category="general" size={48} iconSize={24} />)
    expect(screen.getByRole('img', { name: 'General' })).toHaveStyle({ width: '48px', fontSize: '24px' })
  })

  it('is a square block in a clipping frame when it travels, with the block and the icon marked', () => {
    render(<CategoryIcon category="food.dining_out" travels iconSize={24} />)

    const frame = screen.getByRole('img', { name: 'Dining out' })
    expect(frame).toHaveStyle({ overflow: 'hidden', fontSize: '24px' })
    expect(frame.querySelector('[data-vt="block"] [data-vt="icon"] svg')).not.toBeNull()
  })

  it('shows an unknown category as General', () => {
    render(<CategoryIcon category="food.future_thing" />)

    expect(screen.getByRole('img', { name: 'General' })).toBeInTheDocument()
  })
})
