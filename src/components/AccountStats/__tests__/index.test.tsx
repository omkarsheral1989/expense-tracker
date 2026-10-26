// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSpend, AccountSummary } from '../../../services/accountService/types.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AccountStats } from '../index.tsx'

beforeEach(() => vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const month = { start: '2026-10-15', end: '2026-11-14' }

/** A credit card in pounds with a £600 target a month and a £100,000 limit, and what it spent. */
function account(spend: Partial<AccountSpend> = {}, overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: 'a1',
    kind: 'card',
    name: 'HDFC Regalia',
    currency: 'GBP',
    statementDay: 15,
    creditLimitMinor: 10_000_000,
    spendTargetMinor: 60_000,
    spendTargetPeriod: 'month',
    inUse: false,
    spend: { cycle: month, cycleSpentMinor: 0, target: { ...month, period: 'month' }, targetSpentMinor: 0, skipped: 0, ...spend },
    ...overrides,
  }
}

function show(summary: AccountSummary) {
  return renderPage(<AccountStats account={summary} />)
}

const rings = () => screen.getAllByRole('progressbar')

describe('AccountStats', () => {
  it('shows nothing for a bank account', () => {
    const { container } = show(account({}, { kind: 'bank', spend: null, creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null }))

    expect(container.querySelector('.ant-flex')).toBeNull()
  })

  it('shows two tiles side by side: the spend target, then the credit limit', () => {
    show(account({ targetSpentMinor: 15_000, cycleSpentMinor: 15_000 }))

    expect(screen.getByText('Spend target')).toBeInTheDocument()
    expect(screen.getByText('£600.00')).toBeInTheDocument()
    expect(screen.getByText('£150.00 spent this month')).toBeInTheDocument()
    expect(screen.getByText('Credit limit')).toBeInTheDocument()
    expect(screen.getByText('£100,000.00')).toBeInTheDocument()
    expect(screen.getByText('£150.00 spent this cycle')).toBeInTheDocument()
    expect(screen.getByText('Spend target').compareDocumentPosition(screen.getByText('Credit limit')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says "this quarter" for a quarterly target', () => {
    show(account({ target: { ...month, period: 'quarter' }, targetSpentMinor: 100 }, { spendTargetPeriod: 'quarter' }))

    expect(screen.getByText('£1.00 spent this quarter')).toBeInTheDocument()
  })

  it('puts a ring with the whole percentage on each tile', () => {
    show(account({ targetSpentMinor: 27_199, cycleSpentMinor: 27_199 }))

    // 271.99 of 600.00 is 45.33%, and of 100,000.00 is 0.27%.
    expect(rings().map((ring) => ring.textContent)).toEqual(['45%', '0%'])
    expect(rings()[0]).toHaveAttribute('aria-label', '45% of the target')
    expect(rings()[1]).toHaveAttribute('aria-label', '0% of the limit')
  })

  it('rounds the percentage to the nearest whole number', () => {
    show(account({ targetSpentMinor: 27_300 }))

    // 45.5% rounds up.
    expect(rings()[0]).toHaveTextContent('46%')
  })

  it('shows the real percentage past 100%, with the ring full', () => {
    show(account({ targetSpentMinor: 90_000 }))

    expect(rings()[0]).toHaveTextContent('150%')
    expect(rings()[0]).toHaveAttribute('aria-valuenow', '100')
  })

  it('shows 100% as a number, not a tick', () => {
    show(account({ targetSpentMinor: 60_000 }))

    expect(rings()[0]).toHaveTextContent('100%')
  })

  it('is as high as the two lines beside it: 44 px', () => {
    show(account())

    expect(rings()[0].querySelector('.ant-progress-body')).toHaveStyle({ width: '44px', height: '44px' })
  })

  it('shows only the target tile when there is no limit, and only the limit tile when there is no target', () => {
    const { unmount } = show(account({}, { creditLimitMinor: null }))
    expect(screen.getByText('Spend target')).toBeInTheDocument()
    expect(screen.queryByText('Credit limit')).not.toBeInTheDocument()
    unmount()

    show(account({ target: null }, { spendTargetMinor: null, spendTargetPeriod: null }))
    expect(screen.queryByText('Spend target')).not.toBeInTheDocument()
    expect(screen.getByText('Credit limit')).toBeInTheDocument()
  })

  it('shows no tile for a card with neither', () => {
    show(account({ target: null }, { creditLimitMinor: null, spendTargetMinor: null, spendTargetPeriod: null }))

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('says how many expenses it could not count', () => {
    const { unmount } = show(account({ skipped: 1 }))
    expect(screen.getByText('1 expense in another currency has no charged amount and is not counted.')).toBeInTheDocument()
    unmount()

    show(account({ skipped: 3 }))
    expect(screen.getByText('3 expenses in other currencies have no charged amount and are not counted.')).toBeInTheDocument()
  })

  it('says nothing about skipped expenses when none were skipped', () => {
    show(account({ skipped: 0 }))

    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument()
  })

  it('writes each amount in the card\'s own currency', () => {
    show(account({ targetSpentMinor: 5_000_000 }, { currency: 'INR', creditLimitMinor: 50_000_000, spendTargetMinor: 20_000_000 }))

    expect(screen.getByText('₹2,00,000.00')).toBeInTheDocument()
    expect(screen.getByText('₹5,00,000.00')).toBeInTheDocument()
    expect(within(screen.getByText('Spend target').parentElement as HTMLElement).getByText('₹2,00,000.00')).toBeInTheDocument()
  })
})
