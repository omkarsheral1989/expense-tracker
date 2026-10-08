// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groups } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import { groupService } from '../../../services/groupService'
import type { CreateGroupInput } from '../../../services/groupService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { HomePage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }
const priya = { email: 'priya@gmail.com', name: 'Priya' }

const testDb = setUpTestDatabase()

async function createGroup(
  creator: { email: string; name: string },
  input: Partial<CreateGroupInput> & { name: string },
) {
  const result = await groupService.createGroup(testDb.db, creator, {
    type: 'trip',
    defaultCurrency: 'GBP',
    memberEmails: [],
    ...input,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

async function changedAt(groupId: string, iso: string) {
  await testDb.db.update(groups).set({ updatedAt: new Date(iso) }).where(eq(groups.id, groupId))
}

async function addExpense(email: string, groupId: string, amountMinor: number, currency: string) {
  const result = await expenseService.createExpense(testDb.db, email, groupId, {
    description: 'Dinner',
    category: 'general',
    amountMinor,
    currency,
    date: '2026-10-08',
    notes: '',
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
}

/** The balance text at the end of a group's row. */
function balanceOf(groupName: string) {
  const row = screen.getByText(groupName).closest('.ant-card') as HTMLElement
  return row.querySelector('.ant-card-body > .ant-flex > :last-child')?.textContent
}

function renderHome() {
  return renderPage(<HomePage />, {
    path: ROUTES.home,
    routes: [ROUTES.newGroup, ROUTES.groupPattern],
  })
}

describe('HomePage', () => {
  beforeEach(() => {
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    vi.mocked(getDb).mockClear()
  })

  describe('while the groups load', () => {
    it('shows grey placeholder rows under the heading', async () => {
      vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
      renderHome()

      expect(screen.getByRole('heading', { name: 'Your groups' })).toBeInTheDocument()
      expect(screen.getByRole('status', { name: 'Loading your groups' })).toBeInTheDocument()
      expect(screen.queryByText(/no groups yet/i)).not.toBeInTheDocument()
    })
  })

  describe('with no groups', () => {
    it('shows a friendly message and a single Create group button', async () => {
      renderHome()

      expect(
        await screen.findByText('No groups yet. Create one to start sharing expenses.'),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /create group/i })).toHaveLength(1)
    })

    it('opens the create-group page from that button', async () => {
      const page = renderHome()
      await userEvent.click(await screen.findByRole('button', { name: /create group/i }))
      expect(page.currentPath()).toBe(ROUTES.newGroup)
    })

    it('does not show groups that belong to other people', async () => {
      await createGroup(priya, { name: 'Priya flat' })
      renderHome()

      expect(await screen.findByText(/no groups yet/i)).toBeInTheDocument()
      expect(screen.queryByText('Priya flat')).not.toBeInTheDocument()
    })
  })

  describe('with groups', () => {
    it('lists each group with its name, members, currency and status', async () => {
      await createGroup(me, {
        name: 'Goa trip',
        defaultCurrency: 'GBP',
        memberEmails: ['priya@gmail.com', 'sam@gmail.com'],
      })
      await createGroup(me, { name: 'Flat', type: 'home', defaultCurrency: 'INR' })
      renderHome()

      expect(await screen.findByText('Goa trip')).toBeInTheDocument()
      expect(screen.getByText('3 members · GBP')).toBeInTheDocument()
      expect(screen.getByText('Flat')).toBeInTheDocument()
      // One member is "1 member", not "1 members".
      expect(screen.getByText('1 member · INR')).toBeInTheDocument()
      expect(screen.getAllByText('Settled up')).toHaveLength(2)
    })

    it('ends each row with what you are owed or owe there, one line per currency', async () => {
      const goa = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const flat = await createGroup(me, { name: 'Flat', memberEmails: ['priya@gmail.com'] })
      await createGroup(me, { name: 'Quiet' })
      await addExpense(me.email, goa, 3000, 'GBP')
      await addExpense(priya.email, goa, 100000, 'INR')
      await addExpense(priya.email, flat, 1001, 'EUR')
      renderHome()

      await screen.findByText('Goa trip')
      expect(balanceOf('Goa trip')).toBe('you are owed£15.00you owe₹500.00')
      expect(balanceOf('Flat')).toBe('you owe€5.00')
      expect(balanceOf('Quiet')).toBe('Settled up')

      const owed = screen.getByText('£15.00').parentElement as HTMLElement
      expect(owed).toHaveStyle({ color: 'rgb(47, 158, 68)' })
      const owe = screen.getByText('€5.00').parentElement as HTMLElement
      expect(owe).toHaveStyle({ color: 'rgb(232, 89, 12)' })
    })

    it('shows the icon of each group\'s type', async () => {
      await createGroup(me, { name: 'Goa', type: 'trip' })
      await createGroup(me, { name: 'Flat', type: 'home' })
      await createGroup(me, { name: 'Us', type: 'couple' })
      await createGroup(me, { name: 'Misc', type: 'other' })
      renderHome()

      const goa = (await screen.findByRole('link', { name: /goa/i }))
      expect(within(goa).getByRole('img', { name: 'Trip' })).toBeInTheDocument()
      expect(within(screen.getByRole('link', { name: /flat/i })).getByRole('img', { name: 'Home' })).toBeInTheDocument()
      expect(within(screen.getByRole('link', { name: /us/i })).getByRole('img', { name: 'Couple' })).toBeInTheDocument()
      expect(within(screen.getByRole('link', { name: /misc/i })).getByRole('img', { name: 'Other' })).toBeInTheDocument()
    })

    it('lists the most recently changed group first', async () => {
      const old = await createGroup(me, { name: 'Old' })
      const recent = await createGroup(me, { name: 'Recent' })
      const middle = await createGroup(me, { name: 'Middle' })
      await changedAt(old, '2026-01-01T00:00:00Z')
      await changedAt(recent, '2026-03-01T00:00:00Z')
      await changedAt(middle, '2026-02-01T00:00:00Z')
      renderHome()

      await screen.findByText('Recent')
      const names = screen.getAllByRole('link').map((link) => link.textContent)
      expect(names[0]).toContain('Recent')
      expect(names[1]).toContain('Middle')
      expect(names[2]).toContain('Old')
    })

    it('includes groups other people made when you are a member, and leaves out the rest', async () => {
      await createGroup(priya, { name: 'Shared flat', memberEmails: ['omkar@gmail.com'] })
      await createGroup(priya, { name: 'Not mine' })
      renderHome()

      expect(await screen.findByText('Shared flat')).toBeInTheDocument()
      expect(screen.queryByText('Not mine')).not.toBeInTheDocument()
    })

    it('makes every row a link to that group\'s page', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderHome()

      const row = await screen.findByRole('link', { name: /goa trip/i })
      expect(row).toHaveAttribute('href', ROUTES.group(id))

      await userEvent.click(row)
      expect(page.currentPath()).toBe(ROUTES.group(id))
    })

    it('puts the Create group button beside the heading, and it opens the form', async () => {
      await createGroup(me, { name: 'Goa trip' })
      const page = renderHome()
      await screen.findByText('Goa trip')

      const buttons = screen.getAllByRole('button', { name: /create group/i })
      expect(buttons).toHaveLength(1)
      expect(screen.queryByText(/no groups yet/i)).not.toBeInTheDocument()

      await userEvent.click(buttons[0])
      expect(page.currentPath()).toBe(ROUTES.newGroup)
    })
  })

  describe('when the groups cannot be loaded', () => {
    it('says so, and Try again loads them', async () => {
      await createGroup(me, { name: 'Goa trip' })
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderHome()

      expect(await screen.findByText("Couldn't load your groups")).toBeInTheDocument()
      expect(screen.queryByText('Goa trip')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText('Goa trip')).toBeInTheDocument()
      expect(screen.queryByText("Couldn't load your groups")).not.toBeInTheDocument()
    })
  })

  describe('the browser tab', () => {
    it('is titled "Your groups · OwnLedger"', async () => {
      renderHome()
      await screen.findByText(/no groups yet/i)
      await waitFor(() => expect(document.title).toBe('Your groups · OwnLedger'))
    })
  })

  it('shows nothing when nobody is signed in', () => {
    useAuthStore.setState({ profile: null })
    renderHome()
    expect(screen.queryByRole('heading', { name: 'Your groups' })).not.toBeInTheDocument()
  })
})
