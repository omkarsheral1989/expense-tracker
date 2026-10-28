// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupBalance } from '../index.tsx'

afterEach(cleanup)

const owed = [{ currency: 'GBP', amountMinor: 1500 }]
const spent = [{ currency: 'GBP', totalMinor: 6000 }]

describe('GroupBalance', () => {
  it('says what you are owed or owe, one entry per currency', () => {
    render(<GroupBalance balances={[...owed, { currency: 'INR', amountMinor: -50000 }]} />)

    expect(screen.getByText('you are owed')).toBeInTheDocument()
    expect(screen.getByText('£15.00')).toBeInTheDocument()
    expect(screen.getByText('you owe')).toBeInTheDocument()
    expect(screen.getByText('₹500.00')).toBeInTheDocument()
  })

  it('says "Settled up" when nothing is owed', () => {
    render(<GroupBalance balances={[]} />)

    expect(screen.getByText('Settled up')).toBeInTheDocument()
  })

  it('shows what the group spent, as bold amounts and nothing else, for a group of one', () => {
    render(<GroupBalance balances={[]} spent={[...spent, { currency: 'EUR', totalMinor: 1001 }]} />)

    expect(screen.getByText('£60.00').tagName).toBe('STRONG')
    expect(screen.getByText('€10.01')).toBeInTheDocument()
    expect(screen.queryByText('Settled up')).not.toBeInTheDocument()
    expect(screen.queryByText(/you owe|you are owed/)).not.toBeInTheDocument()
  })

  it('shows the amounts in the order given, one under the other', () => {
    render(<GroupBalance balances={[]} spent={[{ currency: 'EUR', totalMinor: 100 }, { currency: 'GBP', totalMinor: 200 }]} />)

    const amounts = screen.getAllByText(/[€£]/).map((one) => one.textContent)
    expect(amounts).toEqual(['€1.00', '£2.00'])
  })

  it('says "Settled up" for a group of one that has spent nothing', () => {
    render(<GroupBalance balances={[]} spent={[]} />)

    expect(screen.getByText('Settled up')).toBeInTheDocument()
  })

  it('shows the amount spent, not a balance, when both are given', () => {
    render(<GroupBalance balances={owed} spent={spent} />)

    expect(screen.getByText('£60.00')).toBeInTheDocument()
    expect(screen.queryByText('£15.00')).not.toBeInTheDocument()
  })
})
