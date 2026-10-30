// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpAddExpenseTests, me, amountInput, saveButton } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { createGroup, renderForm } = setUpAddExpenseTests()

describe('AddExpensePage: Cancel and Add expense under the receipts', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    user = userEvent.setup()
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(getDb).mockClear()
  })

  it('has no Save button in the header any more: it holds only Back and the heading', async () => {
    const id = await createGroup()
    renderForm(id)
    const heading = await screen.findByRole('heading', { name: 'Add expense', level: 3 })

    const header = heading.closest('[data-vt="header"]') as HTMLElement
    expect(within(header).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Back'])
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('ends the form with Cancel and "Add expense", after the receipts, on the right', async () => {
    const id = await createGroup()
    renderForm(id)
    await screen.findByRole('heading', { name: 'Add expense' })

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const add = saveButton()
    expect(add).toHaveAttribute('type', 'submit')
    expect(add).toHaveClass('ant-btn-primary')
    expect(cancel).toHaveAttribute('type', 'button')
    // One row holding both, justified to the end, and it comes after the receipts' camera button.
    const row = add.parentElement as HTMLElement
    expect(row).toBe(cancel.parentElement)
    expect(row).toHaveClass('ant-flex-justify-flex-end')
    const camera = screen.getByRole('button', { name: 'Add receipt photos' })
    expect(camera.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.nextElementSibling).toBeNull()
  })

  it('leaves at once on Cancel while nothing was entered', async () => {
    const id = await createGroup()
    const page = renderForm(id)
    await screen.findByRole('heading', { name: 'Add expense' })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
    expect(screen.queryByRole('dialog', { name: 'Discard this expense?' })).not.toBeInTheDocument()
  })

  it('asks "Discard this expense?" on Cancel once something was entered, and leaves on Discard', async () => {
    const id = await createGroup()
    const page = renderForm(id)
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const dialog = await screen.findByRole('dialog', { name: 'Discard this expense?' })
    expect(page.currentPath()).toBe(ROUTES.newExpense(id))
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
  })

  it('saves with "Add expense" and goes back to the group', async () => {
    const id = await createGroup()
    const page = renderForm(id)
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Dinner')
    await user.type(amountInput(), '20')

    await user.click(saveButton())

    expect(await screen.findByText('Expense added.')).toBeInTheDocument()
    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(id)))
  })
})
