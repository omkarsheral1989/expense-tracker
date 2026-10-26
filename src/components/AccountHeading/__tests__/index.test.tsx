// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountHeading } from '../index.tsx'

beforeEach(() => vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AccountHeading', () => {
  it('shows the icon, the name, and the currency symbol, a dot and the kind under it', () => {
    render(<AccountHeading account={{ kind: 'bank', name: 'Barclays Savings', currency: 'GBP' }} />)

    expect(screen.getByRole('img', { name: 'Bank account' })).toBeInTheDocument()
    expect(screen.getByText('Barclays Savings')).toBeInTheDocument()
    expect(screen.getByText('£ · Bank account')).toBeInTheDocument()
  })

  it('says "Credit card" for a card, with the card icon', () => {
    render(<AccountHeading account={{ kind: 'card', name: 'HDFC Regalia', currency: 'INR' }} />)

    expect(screen.getByRole('img', { name: 'Credit card' }).querySelector('[data-icon="credit-card"]')).not.toBeNull()
    expect(screen.getByText('₹ · Credit card')).toBeInTheDocument()
  })

  it('writes a currency no symbol tells apart as its code', () => {
    render(<AccountHeading account={{ kind: 'bank', name: 'Curaçao', currency: 'ANG' }} />)

    expect(screen.getByText('ANG · Bank account')).toBeInTheDocument()
  })

  it('has two lines of 20 px, so the text is as high as the 40 px icon', () => {
    render(<AccountHeading account={{ kind: 'bank', name: 'Barclays Savings', currency: 'GBP' }} />)

    expect(screen.getByText('Barclays Savings')).toHaveStyle({ lineHeight: '20px' })
    expect(screen.getByText('£ · Bank account')).toHaveStyle({ lineHeight: '20px' })
    expect(screen.getByRole('img', { name: 'Bank account' })).toHaveStyle({ width: '40px', height: '40px' })
  })
})
