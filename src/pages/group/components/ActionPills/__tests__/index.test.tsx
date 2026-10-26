// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../../../routes.ts'
import { renderPage } from '../../../../../testing/render.tsx'
import { ActionPills } from '../index.tsx'

afterEach(cleanup)

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'
const settleUp = () => screen.getByRole('button', { name: 'Settle up' })
const TIP = 'You are the only member of this group.'

function renderPills(props: { canSettle: boolean; loading?: boolean }) {
  return renderPage(<ActionPills groupId={GROUP} {...props} />, { path: '/pills', routes: [ROUTES.settleUp(GROUP)] })
}

describe('ActionPills', () => {
  it('opens the settle-up page when there is someone to settle up with', async () => {
    const page = renderPills({ canSettle: true })
    await userEvent.click(settleUp())
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.settleUp(GROUP)))
  })

  it('has the border of a button, drawn over the pill by its frame rather than under the button', () => {
    renderPills({ canSettle: true })

    const frame = settleUp().closest('[data-settle-pill]') as HTMLElement
    expect(frame).toHaveStyle({ borderRadius: '999px', overflow: 'hidden' })
    // The border is the frame's ::after (src/index.css); an outline on the frame would be covered by the white button.
    expect(frame.style.outline).toBe('')
    expect(settleUp()).toHaveStyle({ borderRadius: '0px' })
  })

  it('switches Settle up off, with a tip, in a group of one', async () => {
    renderPills({ canSettle: false })
    expect(settleUp()).toBeDisabled()
    await userEvent.hover(settleUp().parentElement as HTMLElement)
    expect(await screen.findByText(TIP)).toBeInTheDocument()
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
