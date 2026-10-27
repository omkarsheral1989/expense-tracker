// @vitest-environment jsdom
// Journeys through the real app, down to a database: what a person does to
// split expenses, written the way they use the screen.
import 'fake-indexeddb/auto'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ROUTES } from '../routes.ts'
import { captureLogs } from '../testing/logs.ts'
import {
  addExpense,
  continueAsGuest,
  createGroupWithFriend,
  OPENING,
  pick,
  renderApp,
  reopenApp,
  setUpJourneyTests,
} from './helpers.tsx'

vi.mock('../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: false }))
// Charts have no size in jsdom unless they are given one.
vi.mock('recharts', async (original) => (await import('../testing/recharts.tsx')).withFixedSize(await original()))
vi.mock('@electric-sql/pglite', async (original) => (await import('../testing/memoryPglite.ts')).memoryPglite(await original()))

const device = setUpJourneyTests()
const logs = captureLogs()

describe('splitting expenses', () => {
  it('creates a group with a friend, shares a dinner, shows who owes whom, and keeps it all after a restart', async () => {
    const { user } = device
    const { currentPath } = renderApp(ROUTES.getStarted)
    await continueAsGuest(user)

    // A group with a friend.
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    expect(await screen.findByText('Goa trip', {}, OPENING)).toBeInTheDocument()
    expect(screen.getByText(/2 members/)).toBeInTheDocument()

    // A dinner, paid by me and split equally: Priya owes half.
    await addExpense(user, 'Beach shack dinner', '100')
    expect(await screen.findByText('Beach shack dinner')).toBeInTheDocument()
    expect(await screen.findByText(/Priya owes you/)).toHaveTextContent('Priya owes you £50.00')

    // The home page shows the group and what I am owed.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Goa trip')).toBeInTheDocument()
    expect(screen.getByText('you are owed')).toBeInTheDocument()
    expect(currentPath()).toBe(ROUTES.home)

    // Closing the app and opening it again changes nothing.
    await reopenApp(ROUTES.home)
    expect(await screen.findByText('Goa trip', {}, OPENING)).toBeInTheDocument()
    expect(screen.getByText('you are owed')).toBeInTheDocument()
    await user.click(screen.getByText('Goa trip'))
    expect(await screen.findByText('Beach shack dinner')).toBeInTheDocument()
    expect(screen.getByText(/Priya owes you/)).toBeInTheDocument()
  })

  it('opens the group\'s totals from the Totals pill, shows how the spending splits, and goes back', async () => {
    const { user } = device
    const { currentPath } = renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Goa trip', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Beach shack dinner', '100')
    await screen.findByText('Beach shack dinner')

    await user.click(await screen.findByRole('button', { name: /Totals$/ }))

    expect(await screen.findByText('Total spent')).toBeInTheDocument()
    expect(screen.getAllByText('£100.00').length).toBeGreaterThan(0)
    expect(currentPath()).toMatch(/\/totals$/)
    expect(screen.getByRole('heading', { name: 'Shares' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Individual contribution' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Shares' })).getAllByRole('listitem')).toHaveLength(2)
    expect(within(screen.getByRole('list', { name: 'Paid' })).getByText('£100.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Beach shack dinner')).toBeInTheDocument()
    expect(currentPath()).not.toMatch(/totals/)
  })

  it('writes the steps of a journey to the log, and nothing personal', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Secret surprise', { name: 'Priya Shah', email: 'priya@gmail.com' })
    await addExpense(user, 'Birthday gift', '123.45')
    await screen.findByText(/Priya owes you/)

    const steps = logs.lines.filter((line) => ['auth', 'database', 'person', 'group', 'expense'].includes(line.scope))
    expect(steps.map((line) => `${line.scope}: ${line.message}`)).toEqual(
      expect.arrayContaining([
        'auth: Continuing as a guest',
        'database: Database opened',
        'person: Person added',
        'group: Group created',
        'expense: Expense created',
      ]),
    )
    const text = JSON.stringify(logs.lines)
    for (const secret of ['Secret surprise', 'Priya', 'priya@gmail.com', 'Birthday gift', '12345']) {
      expect(text).not.toContain(secret)
    }
  })

  it('edits, deletes and restores an expense, with the debt following', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Flat', { name: 'Sam Lee', email: 'sam@gmail.com' })
    await addExpense(user, 'Groceries', '40')
    expect(await screen.findByText(/Sam owes you/)).toHaveTextContent('Sam owes you £20.00')

    // Edit: the description changes and the details page says who edited it.
    await user.click(await screen.findByText('Groceries'))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const description = await screen.findByRole('textbox', { name: 'Description' })
    await user.clear(description)
    await user.type(description, 'Weekly groceries')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Expense updated.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Weekly groceries' })).toBeInTheDocument()
    expect(screen.getByText('You edited this expense')).toBeInTheDocument()

    // Delete: it stays in the group as a line, and nobody owes anything.
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Expense deleted.')).toBeInTheDocument()
    expect(await screen.findByText(/You deleted 'Weekly groceries'/)).toBeInTheDocument()
    expect(screen.getByText("You're all settled up")).toBeInTheDocument()

    // Restore: the expense and the debt are back.
    await user.click(screen.getByText(/You deleted 'Weekly groceries'/))
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    expect(await screen.findByText('Expense restored.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText(/Sam owes you/)).toHaveTextContent('Sam owes you £20.00')
  })

  it('settles up: a payment from the friend clears the debt', async () => {
    const { user } = device
    renderApp(ROUTES.getStarted)
    await continueAsGuest(user)
    await createGroupWithFriend(user, 'Flat', { name: 'Sam Lee', email: 'sam@gmail.com' })
    await addExpense(user, 'Groceries', '40')
    await screen.findByText(/Sam owes you/)

    await user.click(screen.getByRole('button', { name: 'Settle up' }))
    await pick(user, await screen.findByRole('combobox', { name: 'Who paid?' }), 'Sam Lee')
    await pick(user, screen.getByRole('combobox', { name: 'Who received it?' }), 'You')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '20')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Payment recorded.')).toBeInTheDocument()
    expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
    expect(screen.getByText(/Sam paid you/)).toBeInTheDocument()
  })
})
