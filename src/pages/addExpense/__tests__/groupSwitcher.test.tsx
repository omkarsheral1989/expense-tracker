// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpAddExpenseTests, me, amountInput, descriptionInput, notesInput } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { createGroup, renderForm } = setUpAddExpenseTests()

/** Two groups: Goa trip (GBP, three people) and Flat 4B (EUR, two). Returns their ids. */
async function createTwoGroups() {
  const goa = await createGroup({
    name: 'Goa trip',
    defaultCurrency: 'GBP',
    memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
  })
  const flat = await createGroup({
    name: 'Flat 4B',
    type: 'home',
    defaultCurrency: 'EUR',
    memberEmails: ['priya@gmail.com'],
  })
  return { goa, flat }
}

/** A row of the menu of groups: its name is the type's tile ("Trip"), the group's name, then "£ · 3 members". */
const itemOf = (name: string) => new RegExp(name)

const switcher = () => screen.findByRole('button', { name: /^Group: .*Choose another group$/ })

describe('AddExpensePage: choosing the group', () => {
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

  /** Opens the menu of groups and presses one by its name. */
  async function chooseGroup(name: string) {
    await user.click(await switcher())
    await user.click(await screen.findByRole('menuitem', { name: itemOf(name) }))
  }

  it('shows only the group\'s name, with no "With you and" text', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)

    expect(await switcher()).toHaveTextContent('Goa trip')
    expect(screen.queryByText(/With you and/)).not.toBeInTheDocument()
    expect(screen.queryByText(/All of/)).not.toBeInTheDocument()
  })

  it('is a plain label, with nothing to open, when the user has only this group', async () => {
    const goa = await createGroup({ name: 'Goa trip' })
    renderForm(goa)

    expect(await screen.findByText('Goa trip')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Choose another group/ })).not.toBeInTheDocument()
  })

  it('lists the user\'s groups with the current one ticked', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)

    await user.click(await switcher())

    const menu = await screen.findByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    expect(within(menu).getByRole('menuitem', { name: itemOf('Goa trip') })).toHaveClass('ant-dropdown-menu-item-selected')
    expect(within(menu).getByRole('menuitem', { name: itemOf('Flat 4B') })).not.toHaveClass('ant-dropdown-menu-item-selected')
  })

  it('does nothing when the group it already is in is chosen', async () => {
    const { goa } = await createTwoGroups()
    const page = renderForm(goa)

    await chooseGroup('Goa trip')

    expect(page.currentPath()).toBe(ROUTES.newExpense(goa))
  })

  it('moves the expense to the other group, keeping what was entered', async () => {
    const { goa, flat } = await createTwoGroups()
    const page = renderForm(goa)
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Scooter')
    await user.type(amountInput(), '25')
    await user.type(notesInput(), 'Two scooters')

    await chooseGroup('Flat 4B')

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.newExpense(flat)))
    expect(await screen.findByRole('button', { name: /^Group: Flat 4B/ })).toBeInTheDocument()
    expect(descriptionInput()).toHaveValue('Scooter')
    expect(amountInput()).toHaveValue('25')
    expect(notesInput()).toHaveValue('Two scooters')
  })

  it('keeps the form on screen while the other group loads, with no loading placeholder', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Scooter')

    // Watch the page for the placeholder from the moment the group is chosen.
    let placeholderShown = false
    let formMissing = false
    const watcher = new MutationObserver(() => {
      if (screen.queryByRole('status', { name: 'Loading the group' })) placeholderShown = true
      if (!screen.queryByRole('textbox', { name: 'Description' })) formMissing = true
    })
    watcher.observe(document.body, { childList: true, subtree: true })
    await chooseGroup('Flat 4B')
    await screen.findByRole('button', { name: /^Group: Flat 4B/ })
    watcher.disconnect()

    expect(placeholderShown).toBe(false)
    expect(formMissing).toBe(false)
  })

  it('starts the split again for the new group\'s members, with you paying', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)
    // In Goa trip (three people) the sentence has two buttons.
    expect(await screen.findByRole('button', { name: 'equally' })).toBeInTheDocument()

    await chooseGroup('Flat 4B')

    // In Flat 4B (two people) it is the one-button quick choice.
    expect(await screen.findByRole('button', { name: 'You paid, split equally' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'equally' })).not.toBeInTheDocument()
  })

  it('uses the new group\'s currency when the user had not chosen one', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)
    expect(await screen.findByRole('button', { name: 'Currency: GBP' })).toBeInTheDocument()

    await chooseGroup('Flat 4B')

    expect(await screen.findByRole('button', { name: 'Currency: EUR' })).toBeInTheDocument()
  })

  it('keeps a currency the user had chosen', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)
    await user.click(await screen.findByRole('button', { name: /^Currency: / }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a currency' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Search currencies' }), 'yen')
    await user.click(within(dialog).getByRole('button', { name: /^JPY/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Currency: JPY' })).toBeInTheDocument())

    await chooseGroup('Flat 4B')

    expect(await screen.findByRole('button', { name: 'Currency: JPY' })).toBeInTheDocument()
  })

  it('counts what was carried over as input: Back asks before discarding it', async () => {
    const { goa } = await createTwoGroups()
    renderForm(goa)
    await user.type(await screen.findByRole('textbox', { name: 'Description' }), 'Scooter')
    await chooseGroup('Flat 4B')
    await screen.findByRole('button', { name: /^Group: Flat 4B/ })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('dialog', { name: 'Discard this expense?' })).toBeInTheDocument()
  })

  it('opens a new form for the new group with nothing carried when none was entered, and Back leaves at once', async () => {
    const { goa, flat } = await createTwoGroups()
    const page = renderForm(goa)

    await chooseGroup('Flat 4B')
    await screen.findByRole('button', { name: /^Group: Flat 4B/ })
    expect(descriptionInput()).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => expect(page.currentPath()).toBe(ROUTES.group(flat)))
  })
})
