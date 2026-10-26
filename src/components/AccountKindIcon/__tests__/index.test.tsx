// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KIND_COLORS } from '../../../theme/accountColors.ts'
import { AccountKindIcon } from '../index.tsx'

afterEach(cleanup)

describe('AccountKindIcon', () => {
  it('is a teal tile with a bank for a bank account', () => {
    render(<AccountKindIcon kind="bank" />)

    const tile = screen.getByRole('img', { name: 'Bank account' })
    expect(tile.querySelector('[data-icon="bank"]')).not.toBeNull()
    expect(tile).toHaveStyle({ background: ACCOUNT_KIND_COLORS.bank, color: 'rgb(255, 255, 255)' })
  })

  it('is a purple tile with a card for a credit card', () => {
    render(<AccountKindIcon kind="card" />)

    const tile = screen.getByRole('img', { name: 'Credit card' })
    expect(tile.querySelector('[data-icon="credit-card"]')).not.toBeNull()
    expect(tile).toHaveStyle({ background: ACCOUNT_KIND_COLORS.card })
  })

  it('is 40 px by default, with the small corner radius, and takes another size with the icon at half of it', () => {
    const { unmount } = render(<AccountKindIcon kind="bank" />)
    expect(screen.getByRole('img', { name: 'Bank account' })).toHaveStyle({ width: '40px', height: '40px', borderRadius: '10px', fontSize: '20px' })
    unmount()

    render(<AccountKindIcon kind="bank" size={72} />)
    expect(screen.getByRole('img', { name: 'Bank account' })).toHaveStyle({ width: '72px', height: '72px', fontSize: '36px' })
  })

  it('writes the kind under the tile only when asked', () => {
    const { unmount } = render(<AccountKindIcon kind="card" />)
    expect(screen.queryByText('Credit card')).not.toBeInTheDocument()
    unmount()

    render(<AccountKindIcon kind="card" withLabel />)
    expect(screen.getByText('Credit card')).toBeInTheDocument()
  })
})
