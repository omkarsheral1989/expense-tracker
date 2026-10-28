// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenses } from '../../../db/schema.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { addTestExpense } from '../../../testing/expenses.ts'
import { amountInput, descriptionInput, me, saveButton, setUpAddExpenseTests } from './helpers.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const { testDb, createGroup, renderForm } = setUpAddExpenseTests()

describe('AddExpensePage: the category follows the description', () => {
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

  const category = () => screen.getByRole('button', { name: /^Category: / })

  async function open() {
    const id = await createGroup()
    renderForm(id)
    await screen.findByRole('textbox', { name: 'Description' })
    return id
  }

  async function chooseCategory(label: string) {
    await user.click(category())
    await user.click(within(await screen.findByRole('dialog', { name: 'Choose a category' })).getByRole('button', { name: label }))
  }

  it('starts with General', async () => {
    await open()
    expect(category()).toHaveAccessibleName('Category: General')
  })

  it.each([
    ['movie', 'Movies'],
    ['dinner in a restaurant', 'Dining out'],
    ['Netflix', 'Streaming and OTT'],
  ])('picks the category as "%s" is typed', async (description, label) => {
    await open()

    await user.type(descriptionInput(), description)

    expect(category()).toHaveAccessibleName(`Category: ${label}`)
  })

  it('follows the description as it changes, until a category is chosen by hand', async () => {
    await open()
    await user.type(descriptionInput(), 'movie')
    expect(category()).toHaveAccessibleName('Category: Movies')

    await user.clear(descriptionInput())
    await user.type(descriptionInput(), 'petrol')
    expect(category()).toHaveAccessibleName('Category: Fuel')
  })

  it('leaves the category as it is when the description fits nothing', async () => {
    await open()
    await user.type(descriptionInput(), 'movie')

    // Replaced at once by text that fits nothing, with no empty description in between.
    fireEvent.change(descriptionInput(), { target: { value: 'zzzz' } })

    expect(descriptionInput()).toHaveValue('zzzz')
    expect(category()).toHaveAccessibleName('Category: Movies')
  })

  it('puts General back when the description is cleared', async () => {
    await open()
    await user.type(descriptionInput(), 'movie')

    await user.clear(descriptionInput())

    expect(category()).toHaveAccessibleName('Category: General')
  })

  it('no longer changes the category once the user has chosen one, not even when the description is cleared', async () => {
    await open()
    await chooseCategory('Groceries')

    await user.type(descriptionInput(), 'movie')
    expect(category()).toHaveAccessibleName('Category: Groceries')

    await user.clear(descriptionInput())
    expect(category()).toHaveAccessibleName('Category: Groceries')
  })

  it('counts choosing General by hand as a choice too', async () => {
    await open()
    await user.type(descriptionInput(), 'movie')
    await chooseCategory('General')

    await user.type(descriptionInput(), ' tonight')

    expect(category()).toHaveAccessibleName('Category: General')
  })

  it('prefers what the user chose before for the same description', async () => {
    const id = await createGroup()
    await addTestExpense(testDb.db, me.email, id, { description: 'Netflix', category: 'entertainment.apps' })
    renderForm(id)
    await screen.findByRole('textbox', { name: 'Description' })

    await user.type(descriptionInput(), 'Netflix')

    expect(category()).toHaveAccessibleName('Category: Apps and software')
  })

  it('learns from the user\'s expenses in other groups', async () => {
    const other = await createGroup({ name: 'Flat 4B' })
    await addTestExpense(testDb.db, me.email, other, { description: 'Mithai box', category: 'life.gifts' })
    const id = await createGroup()
    renderForm(id)
    await screen.findByRole('textbox', { name: 'Description' })

    await user.type(descriptionInput(), 'Mithai box')

    expect(category()).toHaveAccessibleName('Category: Gifts')
  })

  it('saves the picked category with the expense', async () => {
    const id = await open()
    await user.type(descriptionInput(), 'Netflix')
    await user.type(amountInput(), '9')

    await user.click(saveButton())

    await waitFor(async () => expect(await testDb.db.select().from(expenses)).toHaveLength(1))
    const [saved] = await testDb.db.select().from(expenses)
    expect(saved).toMatchObject({ groupId: id, category: 'entertainment.streaming' })
  })

  describe('when the expense is moved to another group', () => {
    async function openWithTwoGroups() {
      const goa = await createGroup({ name: 'Goa trip' })
      await createGroup({ name: 'Flat 4B', type: 'home' })
      renderForm(goa)
      await screen.findByRole('textbox', { name: 'Description' })
    }

    async function switchToFlat() {
      await user.click(await screen.findByRole('button', { name: /^Group: .*Choose another group$/ }))
      await user.click(await screen.findByRole('menuitem', { name: /Flat 4B$/ }))
      await screen.findByRole('button', { name: /^Group: Flat 4B/ })
    }

    it('keeps an automatic pick automatic', async () => {
      await openWithTwoGroups()
      await user.type(descriptionInput(), 'Netflix')

      await switchToFlat()
      expect(category()).toHaveAccessibleName('Category: Streaming and OTT')
      await user.clear(descriptionInput())
      await user.type(descriptionInput(), 'petrol')

      expect(category()).toHaveAccessibleName('Category: Fuel')
    })

    it('keeps a manual pick manual', async () => {
      await openWithTwoGroups()
      await chooseCategory('Groceries')
      await user.type(descriptionInput(), 'Netflix')

      await switchToFlat()
      await user.clear(descriptionInput())
      await user.type(descriptionInput(), 'petrol')

      expect(category()).toHaveAccessibleName('Category: Groceries')
    })
  })
})
