// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { LoadError } from '../index.tsx'

afterEach(cleanup)

function renderError(props: Partial<Parameters<typeof LoadError>[0]> = {}) {
  const onRetry = vi.fn()
  const page = renderPage(
    <LoadError title="Couldn't load this group" onRetry={onRetry} backTo="/home" {...props} />,
    { path: '/start', routes: ['/home'] },
  )
  return { ...page, onRetry }
}

describe('LoadError', () => {
  it('says what could not be loaded and that nothing was lost', () => {
    renderError()

    expect(screen.getByText("Couldn't load this group")).toBeInTheDocument()
    expect(screen.getByText(/Nothing was lost\. Try again\./)).toBeInTheDocument()
  })

  it('tries again from the button in the middle', async () => {
    const { onRetry } = renderError()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has a Back button, an outlined arrow like the other pages\', that leads where the page says', async () => {
    const page = renderError()

    const back = screen.getByRole('button', { name: 'Back' })
    expect(back).toHaveClass('ant-btn-variant-outlined')
    expect(back.querySelector('.tabler-icon-arrow-left')).not.toBeNull()
    expect(page.currentPath()).toBe('/start')

    await userEvent.click(back)

    expect(page.currentPath()).toBe('/home')
  })

  it('keeps Back at the top left of the screen, outside the message, so it needs nothing of the page around it', () => {
    renderError()

    const bar = screen.getByRole('button', { name: 'Back' }).closest('div[style*="position: fixed"]')
    expect(bar).not.toBeNull()
    expect(bar).toHaveStyle({ top: '0px', left: '0px' })
    expect(bar).not.toContainElement(screen.getByRole('button', { name: 'Try again' }))
  })

  it('shows what went wrong, small, under the message, when it is given', () => {
    renderError({ error: new Error('The database is not open. Sign in first.') })

    expect(screen.getByText('The database is not open. Sign in first.')).toBeInTheDocument()
  })

  it('shows no detail line when there is no error to show', () => {
    renderError()

    expect(screen.queryByText(/database/i)).not.toBeInTheDocument()
  })
})
