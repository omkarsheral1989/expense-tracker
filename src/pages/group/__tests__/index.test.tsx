// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq, ne } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseShares, groupMembers, groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { groupService } from '../../../services/groupService'
import type { CreateGroupInput } from '../../../services/groupService/types.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
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

function renderGroup(groupId: string) {
  return renderPage(<GroupPage />, {
    path: ROUTES.group(groupId),
    pattern: ROUTES.groupPattern,
    routes: [ROUTES.home, ROUTES.newExpensePattern],
  })
}

const dinner: CreateExpenseInput = {
  description: 'Dinner',
  category: 'food.dining_out',
  amountMinor: 3000,
  currency: 'GBP',
  date: '2026-10-08',
  notes: '',
}

async function addExpense(email: string, groupId: string, input: Partial<CreateExpenseInput> = {}) {
  const result = await expenseService.createExpense(testDb.db, email, groupId, { ...dinner, ...input })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.expenseId
}

/** The rows of the expense list, each as its text with spaces between the parts. */
async function expenseRows() {
  const list = await screen.findByRole('list', { name: 'Expenses' })
  return within(list)
    .getAllByRole('listitem')
    .map((row) =>
      [...row.querySelectorAll('span, strong')]
        .filter((part) => part.children.length === 0 && part.textContent)
        .map((part) => part.textContent)
        .join(' | '),
    )
}

/**
 * Matches a button by its text. Ant Design icons add their own name in front
 * ("team 2 people", "plus Add expense"), so the text is matched at the end.
 */
function named(text: string) {
  return new RegExp(`(^|\\s)${text}$`)
}

/** Opens the member list by pressing the "N people" chip, and returns the sheet. */
async function openMembers(count: number) {
  await userEvent.click(await screen.findByRole('button', { name: named(`${count} (people|person)`) }))
  return screen.findByRole('dialog', { name: `Members (${count})` })
}

/** The rows of the member list: [name or email, email line or null, tag]. */
function memberRows(sheet: HTMLElement) {
  return [...sheet.querySelectorAll('.ant-tag')].map((tag) => {
    const row = tag.parentElement as HTMLElement
    const texts = [...row.querySelectorAll('.ant-typography')].map((text) => text.textContent)
    return [texts[0], texts[1] ?? null, tag.textContent]
  })
}

/** Pretends the screen is wide (desktop) or narrow (phone) for Ant Design's breakpoints. */
function setScreenWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

describe('GroupPage', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
    window.matchMedia = originalMatchMedia
    vi.mocked(getDb).mockClear()
  })

  describe('while the group loads', () => {
    it('shows grey placeholders', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      vi.mocked(getDb).mockImplementationOnce(() => new Promise(() => {}))
      renderGroup(id)

      expect(screen.getByRole('status', { name: 'Loading the group' })).toBeInTheDocument()
      expect(screen.queryByText('Goa trip')).not.toBeInTheDocument()
      expect(screen.queryByText('Group not found')).not.toBeInTheDocument()
    })
  })

  describe('the colored band', () => {
    it('shows the group\'s name and its default currency as a chip', async () => {
      const id = await createGroup(me, { name: 'Goa trip', defaultCurrency: 'EUR' })
      renderGroup(id)

      expect(await screen.findByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'EUR' })).toBeInTheDocument()
    })

    it.each([
      ['trip', 'Trip', 'rgb(13, 148, 136)'],
      ['home', 'Home', 'rgb(212, 107, 8)'],
      ['couple', 'Couple', 'rgb(196, 29, 127)'],
      ['other', 'Other', 'rgb(59, 91, 219)'],
    ] as const)('shows the %s icon, in its color, for a %s group', async (type, label, color) => {
      const id = await createGroup(me, { name: 'A group', type })
      renderGroup(id)

      await screen.findByRole('heading', { name: 'A group' })
      const icon = screen.getByRole('img', { name: label })
      expect(icon).toHaveStyle({ background: color })
      // The band behind it is in the same color.
      const band = icon.closest('div[style*="gradient"]') as HTMLElement
      expect(band).not.toBeNull()
      expect(band.style.background).toContain(color)
    })

    it('lets a long name wrap onto more lines instead of cutting it off or running off the screen', async () => {
      const name = 'asdka jhsdk ajshd kajshd kajshjdk ashd kjha skdha sdkhads'
      const id = await createGroup(me, { name })
      renderGroup(id)

      const heading = await screen.findByRole('heading', { name })
      // Not cut off with "…" on a single line, and a long word may break.
      expect(heading).not.toHaveClass('ant-typography-ellipsis')
      expect(heading).toHaveStyle({ overflowWrap: 'anywhere' })
      expect(heading).toHaveTextContent(name)
    })

    it('aligns the icon with the top of the name, not its middle', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      const heading = await screen.findByRole('heading', { name: 'Goa trip' })
      const row = heading.parentElement as HTMLElement
      expect(row).toHaveClass('ant-flex-align-flex-start')
      expect(row).toContainElement(screen.getByRole('img', { name: 'Trip' }))
    })

    it('goes back to the home page with the Back button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderGroup(id)
      await screen.findByRole('heading', { name: 'Goa trip' })

      await userEvent.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.home)
    })

    it.each([
      [1, '1 person'],
      [2, '2 people'],
      [3, '3 people'],
    ])('counts %i member(s) as "%s" on its chip', async (count, text) => {
      const id = await createGroup(me, {
        name: 'Goa',
        memberEmails: ['priya@gmail.com', 'sam@gmail.com'].slice(0, count - 1),
      })
      renderGroup(id)

      expect(await screen.findByRole('button', { name: named(text) })).toBeInTheDocument()
    })

    it('does not count a member who has left', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      const [sam] = await testDb.db.select({ id: people.id }).from(people).where(eq(people.email, 'sam@gmail.com'))
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, sam.id))
      renderGroup(id)

      expect(await screen.findByRole('button', { name: named('2 people') })).toBeInTheDocument()
    })
  })

  describe('what is switched off for now', () => {
    it.each([
      ['button', 'Search'],
      ['button', 'Group settings'],
      ['button', 'Add trip dates'],
      ['button', 'Settle up'],
    ] as const)('switches off the %s "%s"', async (role, name) => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      expect(await screen.findByRole(role, { name: named(name) })).toBeDisabled()
    })

    it.each(['Search', 'Group settings', 'Add trip dates', 'Settle up'])(
      'says "Coming soon" when the pointer rests on "%s"',
      async (name) => {
        const id = await createGroup(me, { name: 'Goa trip' })
        renderGroup(id)

        const button = await screen.findByRole('button', { name: named(name) })
        expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
        // A disabled button gets no pointer events, so the tip hangs on its wrapper.
        await userEvent.hover(button.parentElement as HTMLElement)

        expect(await screen.findByText('Coming soon')).toBeInTheDocument()
      },
    )

    it('keeps the working controls switched on, with no "Coming soon" tip', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)
      await screen.findByRole('heading', { name: 'Goa trip' })

      expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
      expect(screen.getByRole('button', { name: named('1 person') })).toBeEnabled()
      expect(screen.getByRole('button', { name: named('Add expense') })).toBeEnabled()
      await userEvent.hover(screen.getByRole('button', { name: 'Back' }))
      await userEvent.hover(screen.getByRole('button', { name: named('1 person') }))
      await userEvent.hover(screen.getByRole('button', { name: named('Add expense') }))
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    })

    it('does nothing when the currency chip is pressed', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      await userEvent.click(await screen.findByRole('button', { name: 'GBP' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('below the band', () => {
    it('says you are all settled up while there are no expenses', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)

      expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
    })

    it('says there are no expenses yet', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
      expect(screen.getByText('Expenses you add will appear here.')).toBeInTheDocument()
    })

    it('puts the balance, the action pills and the expenses in that order', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      const balance = await screen.findByText("You're all settled up")
      const settleUp = screen.getByRole('button', { name: named('Settle up') })
      const empty = screen.getByText('No expenses yet')
      expect(balance.compareDocumentPosition(settleUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(settleUp.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('adding an expense', () => {
    it('opens the add-expense page of this group', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const { currentPath } = renderGroup(id)

      await userEvent.click(await screen.findByRole('button', { name: named('Add expense') }))

      expect(currentPath()).toBe(ROUTES.newExpense(id))
    })
  })

  describe('the expenses', () => {
    it('lists them newest day first, each with its date, category, title, payer and what it means for you', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id, { description: 'Taxi', category: 'transport.taxi', date: '2026-09-30', amountMinor: 1001 })
      await addExpense(me.email, id, { description: 'Dinner', date: '2026-10-08' })
      renderGroup(id)

      expect(await expenseRows()).toEqual([
        'Oct | 8 | Dinner | You paid £30.00 | you lent | £15.00',
        // 10.01 split in two: the payer takes the extra penny, so lends 5.00.
        'Sep | 30 | Taxi | You paid £10.01 | you lent | £5.00',
      ])
      // Each tile is in the color of its category's group.
      expect(screen.getByRole('img', { name: 'Dining out' })).toHaveStyle({ background: 'rgb(232, 89, 12)' })
      expect(screen.getByRole('img', { name: 'Taxi' })).toHaveStyle({ background: 'rgb(25, 113, 194)' })
      expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
    })

    it('shows what you borrowed when someone else paid, naming them by first name', async () => {
      const id = await createGroup(priya, { name: 'Flat', memberEmails: [me.email] })
      await addExpense(priya.email, id, { description: 'Groceries', amountMinor: 2001, currency: 'INR' })
      // Priya's full name, as if she had signed in with it.
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, priya.email))
      renderGroup(id)

      expect(await expenseRows()).toEqual([
        'Oct | 8 | Groceries | Priya paid ₹20.01 | you borrowed | ₹10.00',
      ])
      const borrowed = screen.getByText('you borrowed').parentElement as HTMLElement
      expect(borrowed).toHaveStyle({ color: 'rgb(232, 89, 12)' })
    })

    it('shows lent amounts in green', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id)
      renderGroup(id)

      const lent = (await screen.findByText('you lent')).parentElement as HTMLElement
      expect(lent).toHaveStyle({ color: 'rgb(47, 158, 68)' })
    })

    it('says "no balance" for an expense you paid for yourself alone', async () => {
      const id = await createGroup(me, { name: 'Solo' })
      await addExpense(me.email, id)
      renderGroup(id)

      expect(await expenseRows()).toEqual(['Oct | 8 | Dinner | You paid £30.00 | no balance'])
    })

    it('says "not involved" for an expense you have no part in', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const expenseId = await addExpense(me.email, id)
      // As if Priya had paid and the split left you out.
      const [priyaRow] = await testDb.db.select().from(people).where(eq(people.email, priya.email))
      await testDb.db.update(expenseShares).set({ paidMinor: 3000, owedMinor: 3000 }).where(eq(expenseShares.personId, priyaRow.id))
      await testDb.db.update(expenseShares).set({ deletedAt: new Date() }).where(and(eq(expenseShares.expenseId, expenseId), ne(expenseShares.personId, priyaRow.id)))
      renderGroup(id)

      expect(await expenseRows()).toEqual(['Oct | 8 | Dinner | priya paid £30.00 | not involved'])
    })
  })

  describe('the members', () => {
    it('stays closed until the "N people" chip is pressed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await screen.findByRole('button', { name: named('2 people') })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('priya@gmail.com')).not.toBeInTheDocument()
    })

    it('opens with the count in its title', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      renderGroup(id)

      const sheet = await openMembers(3)

      expect(within(sheet).getByText('Members (3)')).toBeInTheDocument()
    })

    it('closes with its close button', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(2)

      await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('closes when the dimmed area outside it is pressed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await openMembers(2)

      await userEvent.click(document.querySelector('.ant-drawer-mask') as HTMLElement)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('can be opened again after it was closed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(2)
      await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await openMembers(2)

      expect(screen.getByText('priya@gmail.com')).toBeInTheDocument()
    })

    it('slides up from the bottom on a phone', async () => {
      setScreenWide(false)
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await openMembers(2)

      expect(document.querySelector('.ant-drawer')).toHaveClass('ant-drawer-bottom')
    })

    it('slides in from the right on a wide screen', async () => {
      setScreenWide(true)
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await openMembers(2)

      expect(document.querySelector('.ant-drawer')).toHaveClass('ant-drawer-right')
    })

    it('lists you first, then the others A to Z, with a name and an email each', async () => {
      const id = await createGroup(me, {
        name: 'Goa',
        memberEmails: ['zed@gmail.com', 'priya@gmail.com', 'amy@gmail.com'],
      })
      await testDb.db.update(people).set({ name: 'Zoe' }).where(eq(people.email, 'amy@gmail.com'))
      await testDb.db.update(people).set({ name: 'Bea' }).where(eq(people.email, 'zed@gmail.com'))
      renderGroup(id)
      const sheet = await openMembers(4)

      expect(memberRows(sheet).map(([primary]) => primary)).toEqual([
        'Omkar Sheral',
        'Bea',
        'priya@gmail.com',
        'Zoe',
      ])
    })

    it('tags you as "You" and everyone else as "Pending"', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(3)

      expect(memberRows(sheet).map(([, , tag]) => tag)).toEqual(['You', 'Pending', 'Pending'])
      expect(within(sheet).getAllByText('You')).toHaveLength(1)
    })

    it('shows a member\'s name with their email under it, and just the email when there is no name', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      renderGroup(id)
      const sheet = await openMembers(3)

      expect(memberRows(sheet)).toEqual([
        ['Omkar Sheral', 'omkar@gmail.com', 'You'],
        ['Priya Shah', 'priya@gmail.com', 'Pending'],
        // No name: the email is the title, and is not repeated underneath.
        ['sam@gmail.com', null, 'Pending'],
      ])
    })

    it('gives each member an avatar with their initial', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      renderGroup(id)
      const sheet = await openMembers(2)

      const initials = [...sheet.querySelectorAll('.ant-avatar')].map((avatar) => avatar.textContent)
      expect(initials).toEqual(['O', 'P'])
    })

    it('does not list a member who has left', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      const [sam] = await testDb.db.select({ id: people.id }).from(people).where(eq(people.email, 'sam@gmail.com'))
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, sam.id))
      renderGroup(id)
      const sheet = await openMembers(2)

      expect(within(sheet).queryByText('sam@gmail.com')).not.toBeInTheDocument()
    })

    it('shows the group from the point of view of whoever opens it', async () => {
      const id = await createGroup(priya, { name: 'Flat', memberEmails: ['omkar@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(2)

      // The user's own record has no name (Priya added them by email), so the
      // name comes from their Google profile.
      expect(memberRows(sheet)).toEqual([
        ['Omkar Sheral', 'omkar@gmail.com', 'You'],
        ['Priya', 'priya@gmail.com', 'Pending'],
      ])
    })

    it('prefers the name saved for you over the one from your Google profile', async () => {
      const id = await createGroup(me, { name: 'Goa' })
      await testDb.db.update(people).set({ name: 'Omkar S.' }).where(eq(people.email, me.email))
      renderGroup(id)
      const sheet = await openMembers(1)

      expect(memberRows(sheet)).toEqual([['Omkar S.', 'omkar@gmail.com', 'You']])
    })
  })

  describe('a group that is not there for this user', () => {
    async function expectNotFound(page: ReturnType<typeof renderGroup>) {
      expect(await screen.findByText('Group not found')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: named('(people|person)') })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('link', { name: 'Back to your groups' }))
      expect(page.currentPath()).toBe(ROUTES.home)
    }

    it('says "Group not found" for an unknown group, with a way back', async () => {
      await createGroup(me, { name: 'Mine' })
      await expectNotFound(renderGroup(crypto.randomUUID()))
    })

    it('says the same for something that is not an id at all', async () => {
      await createGroup(me, { name: 'Mine' })
      await expectNotFound(
        renderPage(<GroupPage />, {
          path: '/groups/not-an-id',
          pattern: ROUTES.groupPattern,
          routes: [ROUTES.home],
        }),
      )
    })

    it('says the same for a group you are not in, so it does not reveal that it exists', async () => {
      await createGroup(me, { name: 'Mine' })
      const theirs = await createGroup(priya, { name: 'Priya\'s flat' })
      await expectNotFound(renderGroup(theirs))
      expect(screen.queryByText('Priya\'s flat')).not.toBeInTheDocument()
    })

    it('says the same for a deleted group', async () => {
      const id = await createGroup(me, { name: 'Gone' })
      await testDb.db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, id))
      await expectNotFound(renderGroup(id))
    })

    it('says the same for a group you have left', async () => {
      const id = await createGroup(me, { name: 'Left', memberEmails: ['priya@gmail.com'] })
      const [mine] = await testDb.db.select({ id: people.id }).from(people).where(eq(people.email, me.email))
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, mine.id))
      await expectNotFound(renderGroup(id))
    })
  })

  describe('when the group cannot be loaded', () => {
    it('says so, and Try again loads it', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
      renderGroup(id)

      expect(await screen.findByText("Couldn't load this group")).toBeInTheDocument()
      expect(screen.queryByText('Group not found')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.queryByText("Couldn't load this group")).not.toBeInTheDocument()
    })
  })

  describe('the browser tab', () => {
    it('is titled with the group\'s name', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)
      await screen.findByRole('heading', { name: 'Goa trip' })
      await waitFor(() => expect(document.title).toBe('Goa trip · OwnLedger'))
    })

    it('says "Group not found" when there is no such group', async () => {
      renderGroup(crypto.randomUUID())
      await screen.findByText('Group not found', { selector: '.ant-result-title' })
      await waitFor(() => expect(document.title).toBe('Group not found · OwnLedger'))
    })
  })

  it('shows nothing when nobody is signed in', () => {
    useAuthStore.setState({ profile: null })
    renderGroup(crypto.randomUUID())
    expect(screen.queryByText('Group not found')).not.toBeInTheDocument()
    expect(within(document.body).queryByRole('status')).not.toBeInTheDocument()
  })
})
