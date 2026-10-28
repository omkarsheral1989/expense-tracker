// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CATEGORIES } from '../../../services/expenseService/utils.ts'
import { CATEGORY_ICON_NAMES } from '../../CategoryIcon/content.tsx'
import { Icon } from '../index.tsx'
import { ICONS } from '../icons.ts'

describe('Icon', () => {
  afterEach(cleanup)

  it('draws an SVG that follows the font size and the text color, hidden from screen readers', () => {
    const { container } = render(<Icon name="pill" />)

    const svg = container.querySelector('svg')!
    expect(svg).toHaveClass('tabler-icon', 'tabler-icon-pill')
    expect(svg).toHaveAttribute('width', '1em')
    expect(svg).toHaveAttribute('height', '1em')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes a size, a style and a class of Ant Design\'s', () => {
    const { container } = render(<Icon name="pill" size={24} className="ant-dropdown-menu-item-icon" style={{ color: 'red' }} />)

    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveClass('tabler-icon', 'ant-dropdown-menu-item-icon')
    expect(svg).toHaveStyle({ color: 'rgb(255, 0, 0)' })
  })

  it('turns round and round only when it is told to spin', () => {
    const { container, rerender } = render(<Icon name="sync" />)
    expect(container.querySelector('svg')).not.toHaveClass('icon-spin')

    rerender(<Icon name="sync" spin />)
    expect(container.querySelector('svg')).toHaveClass('icon-spin')
  })

  it('is an image with a name when it has a label, and decoration without one', () => {
    const { rerender } = render(<Icon name="warningCircle" label="Action needed" />)
    expect(screen.getByRole('img', { name: 'Action needed' })).toBeInTheDocument()

    rerender(<Icon name="warningCircle" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('draws every icon in the map', () => {
    for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg'), name).not.toBeNull()
      unmount()
    }
  })

  it('gives every category an icon from the map', () => {
    expect(Object.keys(CATEGORY_ICON_NAMES).sort()).toEqual(CATEGORIES.map((category) => category.key).sort())
    for (const name of Object.values(CATEGORY_ICON_NAMES)) expect(Object.keys(ICONS)).toContain(name)
  })
})
