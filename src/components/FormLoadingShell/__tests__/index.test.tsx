// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { FormLoadingShell } from '../index.tsx'

afterEach(cleanup)

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'

function renderShell(withGroup: boolean) {
  return renderPage(
    <FormLoadingShell
      heading="Add expense"
      backTo="/back"
      label="Loading the group"
      group={withGroup ? { name: 'Goa trip', type: 'trip' } : undefined}
    />,
    { path: `/groups/${GROUP}`, pattern: '/groups/:id', routes: ['/back'] },
  )
}

describe('FormLoadingShell', () => {
  it('has the form header: Back, the heading, and Save switched off', () => {
    renderShell(true)
    expect(screen.getByRole('heading', { name: 'Add expense', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows the spinner with its label', () => {
    renderShell(true)
    expect(screen.getByRole('status', { name: 'Loading the group' })).toHaveTextContent('Loading the group…')
  })

  it('goes back to where it was told when Back is pressed', async () => {
    const page = renderShell(true)
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(page.currentPath()).toBe('/back'))
  })

  it('shows the group name and icon when the group is known, and neither when it is not', () => {
    const { unmount } = renderShell(true)
    expect(screen.getByText('Goa trip')).toBeInTheDocument()
    unmount()
    renderShell(false)
    expect(screen.queryByText('Goa trip')).not.toBeInTheDocument()
  })
})
