// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TotalsRow } from '../../../../../services/totalsService/types.ts'
import { ShareList } from '../index.tsx'

afterEach(cleanup)

const row = (overrides: Partial<TotalsRow>): TotalsRow => ({ personId: 'a', email: null, name: 'Priya Shah', picture: null, isYou: false, amountMinor: 0, ...overrides })

const rows: TotalsRow[] = [
  row({ personId: 'me', name: 'Omkar Sheral', isYou: true, amountMinor: 30000 }),
  row({ personId: 'p', name: 'Priya Shah', amountMinor: 20000, picture: 'https://example.com/priya.png' }),
  row({ personId: 's', name: null, email: 'sam@gmail.com', amountMinor: 0 }),
]
const colors = new Map([['me', 'rgb(13, 148, 136)'], ['p', 'rgb(249, 115, 22)'], ['s', 'rgb(99, 102, 241)']])

function renderList(overrides: Partial<React.ComponentProps<typeof ShareList>> = {}) {
  return render(<ShareList label="Shares" rows={rows} currency="GBP" totalMinor={50000} colors={colors} {...overrides} />)
}

const items = () => screen.getAllByRole('listitem')

describe('ShareList', () => {
  it('is a list named for what it shows, with a row for each member', () => {
    renderList({ label: 'Individual contribution' })

    expect(within(screen.getByRole('list', { name: 'Individual contribution' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('names the user "You", others by first name, and a person with no name by the start of their email', () => {
    renderList()

    expect(items().map((item) => within(item).getByText(/^(You|Priya|Sam)$/).textContent)).toEqual(['You', 'Priya', 'Sam'])
  })

  it('writes each amount in the currency, and the percent of the total as a whole number', () => {
    renderList()

    expect(within(items()[0]).getByText('£300.00')).toBeInTheDocument()
    expect(within(items()[0]).getByText('60%')).toBeInTheDocument()
    expect(within(items()[1]).getByText('£200.00')).toBeInTheDocument()
    expect(within(items()[1]).getByText('40%')).toBeInTheDocument()
  })

  it('keeps a member with nothing in the list, as 0 with 0%', () => {
    renderList()

    expect(within(items()[2]).getByText('£0.00')).toBeInTheDocument()
    expect(within(items()[2]).getByText('0%')).toBeInTheDocument()
  })

  it('gives each member the color they have in the donut, as a dot that screen readers skip', () => {
    renderList()

    const dots = items().map((item) => item.querySelector('span[aria-hidden]') as HTMLElement)
    expect(dots.map((dot) => dot.style.background)).toEqual(['rgb(13, 148, 136)', 'rgb(249, 115, 22)', 'rgb(99, 102, 241)'])
    expect(dots[0]).toHaveStyle({ width: '16px', height: '16px', borderRadius: '50%' })
  })

  it('shows each member\'s picture, or their initial when there is none', () => {
    renderList()

    expect(items()[1].querySelector('img')).toHaveAttribute('src', 'https://example.com/priya.png')
    expect(within(items()[2]).getByText('S')).toBeInTheDocument()
  })

  it('writes the currency\'s own decimals', () => {
    renderList({ currency: 'JPY', rows: [row({ personId: 'p', amountMinor: 1500 })], totalMinor: 1500 })

    expect(within(items()[0]).getByText(/1,500/)).toBeInTheDocument()
    expect(within(items()[0]).getByText('100%')).toBeInTheDocument()
  })
})
