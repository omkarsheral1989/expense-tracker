// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../../../routes.ts'
import { renderPage } from '../../../../../testing/render.tsx'
import { ActionPills } from '../index.tsx'

afterEach(cleanup)

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const settleUp = () => screen.getByRole('button', { name: 'Settle up' })
const TIP = 'You are the only member of this group.'

function renderPills(props: { canSettle: boolean; loading?: boolean; canTotal?: boolean }) {
  return renderPage(<ActionPills groupId={GROUP} {...props} />, { path: '/pills', routes: [ROUTES.settleUp(GROUP), ROUTES.totals(GROUP), ROUTES.balances(GROUP)] })
}

describe('ActionPills', () => {
  it('opens the settle-up page when there is someone to settle up with', async () => {
    const page = renderPills({ canSettle: true })
    await userEvent.click(settleUp())
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.settleUp(GROUP)))
  })

  it('is the same white pill with round ends as Balances and Totals, with no frame around it', () => {
    renderPills({ canSettle: true, canTotal: true })

    expect(settleUp()).toHaveStyle({ borderRadius: '999px' })
    expect(settleUp()).toHaveClass('ant-btn-default')
    expect(settleUp().closest('[data-settle-pill]')).toBeNull()
    // It takes the button's own border and its hover and pressed colors, like the other two.
    expect(settleUp().style.border).toBe('')
    for (const name of [/Balances$/, /Totals$/]) {
      expect(screen.getByRole('button', { name }).className).toBe(settleUp().className)
    }
  })

  it('has an arrows icon before its label', () => {
    renderPills({ canSettle: true })

    const icon = settleUp().querySelector('.ant-btn-icon .tabler-icon-arrows-exchange')
    expect(icon).not.toBeNull()
    expect(settleUp()).toHaveTextContent('Settle up')
  })

  it('is not a piece that travels into the settle-up page: the page change is the plain slide', () => {
    renderPills({ canSettle: true })

    expect(settleUp().hasAttribute('data-vt')).toBe(false)
    expect(settleUp().querySelector('[data-vt]')).toBeNull()
  })

  it.each([
    ['Settle up', () => settleUp()],
    ['Balances', () => screen.getByRole('button', { name: /Balances$/ })],
    ['Totals', () => screen.getByRole('button', { name: /Totals$/ })],
  ])('keeps %s from shrinking in the scrolling row', (_name, pill) => {
    renderPills({ canSettle: true, canTotal: true })

    expect(pill().style.flexShrink).toBe('0')
  })

  it('switches Settle up off, with a tip, in a group of one', async () => {
    renderPills({ canSettle: false })
    expect(settleUp()).toBeDisabled()
    await userEvent.hover(settleUp().parentElement as HTMLElement)
    expect(await screen.findByText(TIP)).toBeInTheDocument()
  })

  it('shows one tip at a time: pressing another switched-off pill closes the earlier tip', async () => {
    renderPills({ canSettle: false, canTotal: false })
    const totals = screen.getByRole('button', { name: /Totals$/ })

    await userEvent.hover(settleUp().parentElement as HTMLElement)
    const onlyMember = await screen.findByText(TIP)
    expect(onlyMember.closest('.ant-tooltip')).not.toHaveClass('ant-tooltip-hidden')

    await userEvent.hover(totals.parentElement as HTMLElement)
    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    await waitFor(() => expect(onlyMember.closest('.ant-tooltip')).toHaveClass('ant-tooltip-hidden'))
  })

  it('switches Settle up off, without that tip, while the members are still loading', async () => {
    renderPills({ canSettle: false, loading: true })
    expect(settleUp()).toBeDisabled()
    await userEvent.hover(settleUp())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByText(TIP)).not.toBeInTheDocument()
  })

  it('stays off while loading even when someone is known to be there', () => {
    renderPills({ canSettle: true, loading: true })
    expect(settleUp()).toBeDisabled()
  })
})

describe('the Totals pill (PRD 5.20)', () => {
  const totals = () => screen.getByRole('button', { name: /Totals$/ })

  it('sits beside Settle up, after it, as a white pill with round ends and a chart icon', () => {
    renderPills({ canSettle: true, canTotal: true })

    expect(totals()).toBeEnabled()
    expect(totals()).toHaveStyle({ borderRadius: '999px' })
    expect(totals()).toHaveClass('ant-btn-default')
    expect(totals().querySelector('.tabler-icon-chart-bar')).not.toBeNull()
    expect(settleUp().compareDocumentPosition(totals()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens the totals page', async () => {
    const page = renderPills({ canSettle: true, canTotal: true })

    await userEvent.click(totals())

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.totals(GROUP)))
  })

  it('hands the page the group it knows, so the next page has it', async () => {
    const group = { id: GROUP, name: 'Goa trip', type: 'trip' as const, defaultCurrency: 'GBP', memberCount: 3 }
    function Next() {
      return <p>{JSON.stringify(useLocation().state)}</p>
    }
    renderPage(<ActionPills groupId={GROUP} group={group} canSettle canTotal />, {
      path: '/pills',
      extra: [{ path: ROUTES.totals(GROUP), element: <Next /> }],
    })

    await userEvent.click(totals())

    expect(await screen.findByText(JSON.stringify({ group }))).toBeInTheDocument()
  })

  it('is switched off with the tip "No expenses yet" while the group has nothing that counts', async () => {
    renderPills({ canSettle: true, canTotal: false })

    expect(totals()).toBeDisabled()
    await userEvent.hover(totals().parentElement as HTMLElement)
    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
  })

  it('works in a group of one, where Settle up is switched off', () => {
    renderPills({ canSettle: false, canTotal: true })

    expect(settleUp()).toBeDisabled()
    expect(totals()).toBeEnabled()
  })

  it('is switched off, without a tip, while the group is still loading', async () => {
    renderPills({ canSettle: true, canTotal: true, loading: true })

    expect(totals()).toBeDisabled()
    await userEvent.hover(totals())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
  })

  it('is off unless the page says the group has expenses', () => {
    renderPills({ canSettle: true })

    expect(totals()).toBeDisabled()
  })
})

describe('the Balances pill (PRD 5.21)', () => {
  const balances = () => screen.getByRole('button', { name: /Balances$/ })

  it('sits between Settle up and Totals as a white pill with round ends and a scale icon', () => {
    renderPills({ canSettle: true, canTotal: true })

    expect(balances()).toBeEnabled()
    expect(balances()).toHaveStyle({ borderRadius: '999px' })
    expect(balances()).toHaveClass('ant-btn-default')
    expect(balances().querySelector('.tabler-icon-scale')).not.toBeNull()
    expect(settleUp().compareDocumentPosition(balances()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(balances().compareDocumentPosition(screen.getByRole('button', { name: /Totals$/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens the balances page', async () => {
    const page = renderPills({ canSettle: true })

    await userEvent.click(balances())

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.balances(GROUP)))
  })

  it('hands the page the group it knows, so the next page has it', async () => {
    const group = { id: GROUP, name: 'Goa trip', type: 'trip' as const, defaultCurrency: 'GBP', memberCount: 3 }
    function Next() {
      return <p>{JSON.stringify(useLocation().state)}</p>
    }
    renderPage(<ActionPills groupId={GROUP} group={group} canSettle />, { path: '/pills', extra: [{ path: ROUTES.balances(GROUP), element: <Next /> }] })

    await userEvent.click(balances())

    expect(await screen.findByText(JSON.stringify({ group }))).toBeInTheDocument()
  })

  it('is switched off, with the tip about being the only member, in a group of one', async () => {
    renderPills({ canSettle: false, canTotal: true })

    expect(balances()).toBeDisabled()
    await userEvent.hover(balances().parentElement as HTMLElement)
    expect(await screen.findByText(TIP)).toBeInTheDocument()
  })

  it('is switched off, without a tip, while the members are still loading', async () => {
    renderPills({ canSettle: true, loading: true })

    expect(balances()).toBeDisabled()
    await userEvent.hover(balances())
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByText(TIP)).not.toBeInTheDocument()
  })
})
