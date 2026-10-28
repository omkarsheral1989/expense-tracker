// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { and, eq, ne } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { expenseShares, groupMembers, groups, people } from '../../../db/schema.ts'
import { ABOVE_FLOATING_BUTTON } from '../../../components/FloatingPillButton/constants.ts'
import { ROUTES } from '../../../routes.ts'
import { expenseService } from '../../../services/expenseService'
import type { CreateExpenseInput } from '../../../services/expenseService/types.ts'
import { groupService } from '../../../services/groupService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, addTestSettlement, personIdOf } from '../../../testing/expenses.ts'
import { GUEST_PERSON_ID, renderPage } from '../../../testing/render.tsx'
import { GroupPage } from '../index.tsx'
import { expectCenteredMessage } from '../../../testing/centered.ts'
import { addTestPerson, createTestGroup, type TestGroupInput } from '../../../testing/groups.ts'

// Pages reach the database through `getDb`; point it at the in-memory one.
// The band's Sync button lets a guest sign in with Google; without a client id it only says that is not set up,
// so the tests do not depend on this machine's .env.local (there is no Google provider in tests).
vi.mock('../../../config.ts', () => ({ GOOGLE_CLIENT_ID: '', REQUIRE_INSTALL: true }))

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
  input: Partial<TestGroupInput> & { name: string },
) {
  const result = await createTestGroup(testDb.db, creator, {
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
    routes: [ROUTES.home, ROUTES.editGroupPattern, ROUTES.newExpensePattern, ROUTES.expensePattern],
  })
}

const dinner: Partial<CreateExpenseInput> = {
  description: 'Dinner',
  category: 'food.dining_out',
  amountMinor: 3000,
  currency: 'GBP',
}

async function addExpense(email: string, groupId: string, input: Partial<CreateExpenseInput> = {}) {
  return addTestExpense(testDb.db, email, groupId, { ...dinner, ...input })
}

/** The initial in each member's avatar, in order. */
function initialsOf(sheet: HTMLElement) {
  return [...sheet.querySelectorAll('.ant-avatar')].map((avatar) => avatar.textContent)
}

/** The rows of the expense list, each as its text with spaces between the parts. */
async function expenseRows() {
  const expenses = await screen.findByRole('region', { name: 'Expenses' })
  return within(expenses)
    .getAllByRole('listitem')
    .map((row) =>
      [...row.querySelectorAll('span, strong')]
        // A part's travelling amount ("£30.00" in "You paid £30.00", PRD 5.16) is read with the part, not on its own.
        .filter((part) => !part.matches('[data-vt="amount"]') && part.querySelectorAll(':scope > :not([data-vt="amount"])').length === 0 && part.textContent)
        .map((part) => part.textContent)
        .join(' | '),
    )
}

/**
 * Matches a button by its text. Ant Design icons add their own name in front
 * ("team 2 members", "plus Add expense"), with or without a space between them
 * (only the page's styles make it a space), so the text is matched at the end,
 * and not as the end of a longer number ("12 members").
 */
function named(text: string) {
  return new RegExp(`(?<!\\d)${text}$`)
}

/**
 * Whether the members sheet is closed. Ant Design keeps a closed drawer in the
 * page and only marks it hidden (its styles then hide it), so look for that mark
 * rather than for the dialog, which only disappears from role queries when the
 * styles are loaded.
 */
function membersSheetIsClosed() {
  const sheet = document.querySelector('.ant-drawer-content-wrapper')
  return !sheet || sheet.classList.contains('ant-drawer-content-wrapper-hidden')
}

/** Opens the member list by pressing the "N members" chip, and returns the sheet. */
async function openMembers(count: number) {
  await userEvent.click(await screen.findByRole('button', { name: named(`${count} (members|member)`) }))
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
    useAuthStore.setState({ profile: me, guest: false, token: null })
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
    it('shows the group\'s name and its default currency\'s symbol as a chip', async () => {
      const id = await createGroup(me, { name: 'Goa trip', defaultCurrency: 'EUR' })
      renderGroup(id)

      expect(await screen.findByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '€' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'EUR' })).not.toBeInTheDocument()
    })

    it('names the whole currency when the pointer rests on the currency chip', async () => {
      const id = await createGroup(me, { name: 'Goa trip', defaultCurrency: 'GBP' })
      renderGroup(id)

      const chip = await screen.findByRole('button', { name: '£' })
      expect(screen.queryByText('GBP – British Pound (£)')).not.toBeInTheDocument()
      await userEvent.hover(chip)

      expect(await screen.findByText('GBP – British Pound (£)')).toBeInTheDocument()
    })

    it('shows the currency code on the chip when its symbol is shared with other currencies', async () => {
      const id = await createGroup(me, { name: 'Stockholm', defaultCurrency: 'SEK' })
      renderGroup(id)

      expect(await screen.findByRole('button', { name: 'SEK' })).toBeInTheDocument()
    })

    it('draws a currency symbol larger than a currency code on the chip', async () => {
      const id = await createGroup(me, { name: 'Goa trip', defaultCurrency: 'GBP' })
      renderGroup(id)
      expect(await screen.findByRole('button', { name: '£' })).toHaveStyle({ fontSize: '20px' })
      cleanup()

      const stockholm = await createGroup(me, { name: 'Stockholm', defaultCurrency: 'SEK' })
      renderGroup(stockholm)
      expect(await screen.findByRole('button', { name: 'SEK' })).not.toHaveStyle({ fontSize: '20px' })
    })

    it('puts the currency chip first, then the people, then the trip dates', async () => {
      const id = await createGroup(me, { name: 'Goa trip', defaultCurrency: 'GBP' })
      renderGroup(id)

      const chips = (await screen.findByRole('button', { name: '£' })).parentElement as HTMLElement
      expect([...chips.querySelectorAll('button')].map((chip) => chip.textContent)).toEqual([
        '£',
        expect.stringMatching(/1 member$/),
        expect.stringMatching(/Add trip dates$/),
      ])
    })

    it.each([
      ['trip', 'Trip', 'rgb(8, 145, 178)'],
      ['home', 'Home', 'rgb(212, 107, 8)'],
      ['couple', 'Couple', 'rgb(196, 29, 127)'],
      ['other', 'Other', 'rgb(54, 79, 199)'],
    ] as const)('shows the %s icon, bare and white on the band in its color, for a %s group', async (type, label, color) => {
      const id = await createGroup(me, { name: 'A group', type })
      renderGroup(id)

      await screen.findByRole('heading', { name: 'A group' })
      const icon = screen.getByRole('img', { name: label })
      // No tile behind it: just the 40 px icon in white.
      expect(icon).toHaveStyle({ fontSize: '40px', color: '#fff' })
      expect(icon.style.background).toBe('')
      // The band behind it is in the same color.
      const band = icon.closest('div[style*="gradient"]') as HTMLElement
      expect(band).not.toBeNull()
      expect(band.style.background).toContain(color)
    })

    it('titles the band "Group" beside Back, in the header title style', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      await screen.findByRole('heading', { name: 'Goa trip' })
      const title = screen.getByRole('heading', { name: 'Group', level: 3 })
      expect(title).toHaveStyle({ fontSize: '32px', fontWeight: '100', lineHeight: '40px', textTransform: 'uppercase' })
      expect(title.parentElement).toContainElement(screen.getByRole('button', { name: 'Back' }))
    })

    it('gives the bare icon a soft shadow, so it stands out from the band', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      await screen.findByRole('heading', { name: 'Goa trip' })
      expect(screen.getByRole('img', { name: 'Trip' }).style.filter).toContain('drop-shadow')
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

    it('centers a one-line name on the icon, and lets a longer one wrap downwards from there', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      const heading = await screen.findByRole('heading', { name: 'Goa trip' })
      const row = heading.parentElement as HTMLElement
      expect(row).toContainElement(screen.getByRole('img', { name: 'Trip' }))
      // The row is top-aligned; the name's 38 px line sits 1 px down, so it is
      // centered on the 40 px icon: (40 - 38) / 2.
      expect(row).toHaveClass('ant-flex-align-flex-start')
      expect(heading).toHaveStyle({ lineHeight: '38px', marginTop: '1px' })
    })

    it('goes back to the home page with the Back button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderGroup(id)
      await screen.findByRole('heading', { name: 'Goa trip' })

      await userEvent.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.home)
    })

    it.each([
      [1, '1 member'],
      [2, '2 members'],
      [3, '3 members'],
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

      expect(await screen.findByRole('button', { name: named('2 members') })).toBeInTheDocument()
    })
  })

  describe('what is switched off for now', () => {
    it.each([
      ['button', 'Search'],
      ['button', 'Add trip dates'],
    ] as const)('switches off the %s "%s"', async (role, name) => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      expect(await screen.findByRole(role, { name: named(name) })).toBeDisabled()
    })

    it.each(['Search', 'Add trip dates'])(
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
      expect(screen.getByRole('button', { name: 'Edit group' })).toBeEnabled()
      expect(screen.getByRole('button', { name: named('1 member') })).toBeEnabled()
      expect(screen.getByRole('button', { name: named('Add expense') })).toBeEnabled()
      await userEvent.hover(screen.getByRole('button', { name: 'Back' }))
      await userEvent.hover(screen.getByRole('button', { name: 'Edit group' }))
      await userEvent.hover(screen.getByRole('button', { name: named('1 member') }))
      await userEvent.hover(screen.getByRole('button', { name: named('Add expense') }))
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    })

    it('opens the edit page of this group from the Edit group button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderGroup(id)

      await userEvent.click(await screen.findByRole('button', { name: 'Edit group' }))

      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
    })

    it('opens the edit page of this group from the currency chip', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderGroup(id)

      await userEvent.click(await screen.findByRole('button', { name: '£' }))

      expect(page.currentPath()).toBe(ROUTES.editGroup(id))
    })
  })

  describe('below the band', () => {
    it('says you are all settled up while there are no expenses', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)

      expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
    })

    it('says who owes you and whom you owe, one line per person and currency', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, priya.email))
      await addExpense(me.email, id, { amountMinor: 900 })
      await addExpense(priya.email, id, { amountMinor: 3000, currency: 'INR' })
      renderGroup(id)

      expect(await screen.findByText(/^Priya owes you/)).toHaveTextContent('Priya owes you £3.00')
      expect(screen.getByText(/^Sam owes you/)).toHaveTextContent('Sam owes you £3.00')
      expect(screen.getByText(/^You owe Priya/)).toHaveTextContent('You owe Priya ₹10.00')
      expect(screen.queryByText("You're all settled up")).not.toBeInTheDocument()

      // The amount is bold, green when owed to you and orange-red when you owe.
      const owedToYou = within(screen.getByText(/^Priya owes you/)).getByText('£3.00')
      expect(owedToYou.tagName).toBe('STRONG')
      expect(owedToYou).toHaveStyle({ color: 'rgb(47, 158, 68)' })
      const youOwe = within(screen.getByText(/^You owe Priya/)).getByText('₹10.00')
      expect(youOwe.tagName).toBe('STRONG')
      expect(youOwe).toHaveStyle({ color: 'rgb(232, 89, 12)' })
    })

    it('says you are all settled up when the expenses cancel out', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id, { amountMinor: 1000 })
      await addExpense(priya.email, id, { amountMinor: 1000 })
      renderGroup(id)

      expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
    })

    it('says there are no expenses yet', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
      expect(screen.getByText('Expenses you add will appear here.')).toBeInTheDocument()
    })

    it('centers the empty message in a box that runs from the actions to just above the Add expense button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      const wrapper = (await screen.findByText('No expenses yet')).closest('.ant-flex-align-center') as HTMLElement
      // Ant Design's Flex centers through these classes; `flex: 1` makes the box fill the rest.
      expect(wrapper).toHaveClass('ant-flex-align-center', 'ant-flex-justify-center')
      expect(wrapper).toHaveStyle({ flex: '1' })
      expect(wrapper.getAttribute('style')).toContain(`margin-bottom: calc(${ABOVE_FLOATING_BUTTON}px + env(safe-area-inset-bottom))`)
      expect(wrapper).not.toContainElement(screen.getByRole('button', { name: named('Settle up') }))
    })

    it('puts the action pills, the balance and the expenses in that order', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      const balance = await screen.findByText("You're all settled up")
      const settleUp = screen.getByRole('button', { name: named('Settle up') })
      const empty = screen.getByText('No expenses yet')
      expect(settleUp.compareDocumentPosition(balance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(balance.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('settling up', () => {
    it('opens the settle-up page of this group from the "Settle up" pill', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const { currentPath } = renderGroup(id)

      const pill = await screen.findByRole('button', { name: 'Settle up' })
      expect(pill).toBeEnabled()
      await userEvent.hover(pill)
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
      await userEvent.click(pill)

      expect(currentPath()).toBe(ROUTES.settleUp(id))
    })

    it('switches the pill off in a group of one, with a tip saying why, and does not open the page', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const { currentPath } = renderGroup(id)

      const pill = await screen.findByRole('button', { name: 'Settle up' })
      expect(pill).toBeDisabled()
      // A disabled button gets no pointer events, so the tip hangs on its wrapper.
      await userEvent.hover(pill.parentElement as HTMLElement)
      expect(await screen.findByText('You are the only member of this group.')).toBeInTheDocument()
      await userEvent.click(pill)

      expect(currentPath()).toBe(ROUTES.group(id))
    })

    it('counts a member who has left as no one to settle up with', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const [priyaRow] = await testDb.db.select({ id: people.id }).from(people).where(eq(people.email, 'priya@gmail.com'))
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, priyaRow.id))
      renderGroup(id)

      expect(await screen.findByRole('button', { name: 'Settle up' })).toBeDisabled()
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
      // Each tile is in the color of its category's group (on the square block its rounded frame clips, which travels, PRD 5.16).
      const colorOf = (label: string) => screen.getByRole('img', { name: label }).querySelector('[data-vt="block"]')
      expect(colorOf('Dining out')).toHaveStyle({ background: 'rgb(232, 89, 12)' })
      expect(colorOf('Taxi')).toHaveStyle({ background: 'rgb(25, 113, 194)' })
      expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
    })

    it('words a payment as one line, "You paid Priya £10.00", with no category tile, payer line or status', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id, { description: 'Dinner', date: '2026-10-01' })
      await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id, { date: '2026-10-08' })
      await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, id, { amountMinor: 250, date: '2026-10-05' })
      renderGroup(id)

      expect(await expenseRows()).toEqual([
        'Oct | 8 | You paid Priya £10.00',
        'Oct | 5 | Priya paid you £2.50',
        'Oct | 1 | Dinner | You paid £30.00 | you lent | £15.00',
      ])
      // A payment's icon has no colored tile behind it, unlike a category's.
      const [icon] = screen.getAllByRole('img', { name: 'Settlement' })
      expect(icon).not.toHaveStyle({ background: 'rgb(12, 166, 120)' })
      expect(icon).toHaveStyle({ color: 'rgb(12, 166, 120)' })
      expect(screen.queryByText('Payment')).not.toBeInTheDocument()
    })

    describe('a deleted expense', () => {
      async function remove(email: string, groupId: string, expenseId: string) {
        const result = await expenseService.deleteExpense(testDb.db, await personIdOf(testDb.db, email), groupId, expenseId)
        if (!result.ok) throw new Error('Not deleted.')
      }

      it('stays in its own place as one line, "You deleted \'Dinner\' (£30.00)", with a bin and no tile, payer line or status', async () => {
        const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
        await addExpense(me.email, id, { description: 'Taxi', date: '2026-10-08', amountMinor: 1000 })
        const gone = await addExpense(me.email, id, { description: 'Dinner', date: '2026-10-05' })
        await addExpense(me.email, id, { description: 'Hotel', date: '2026-10-01', amountMinor: 5000 })
        await remove(me.email, id, gone)
        renderGroup(id)

        expect(await expenseRows()).toEqual([
          'Oct | 8 | Taxi | You paid £10.00 | you lent | £5.00',
          "Oct | 5 | You deleted 'Dinner' (£30.00)",
          'Oct | 1 | Hotel | You paid £50.00 | you lent | £25.00',
        ])
        // Its icon has no colored tile behind it, unlike a category's.
        const bin = screen.getByRole('img', { name: 'Deleted' })
        expect(bin).not.toHaveStyle({ background: 'rgb(232, 89, 12)' })
        // Only the two live expenses have a tile; the deleted one has none.
        expect(screen.getAllByRole('img', { name: 'Dining out' })).toHaveLength(2)
      })

      it('names the person who deleted it by first name when it was not you', async () => {
        const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
        await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
        const gone = await addExpense(me.email, id, { description: 'Taxi', amountMinor: 1000 })
        await remove('priya@gmail.com', id, gone)
        renderGroup(id)

        expect(await expenseRows()).toEqual(["Oct | 8 | Priya deleted 'Taxi' (£10.00)"])
      })

      it('words a deleted payment as "You deleted a payment (You paid Priya £10.00)"', async () => {
        const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
        const payment = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id, { date: '2026-10-08' })
        await remove(me.email, id, payment)
        renderGroup(id)

        expect(await expenseRows()).toEqual(['Oct | 8 | You deleted a payment (You paid Priya £10.00)'])
        expect(screen.queryByText('Payment')).not.toBeInTheDocument()
      })

      it('does not count towards the balance, and the list is not empty for it', async () => {
        const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
        const gone = await addExpense(me.email, id, { description: 'Dinner' })
        renderGroup(id)
        expect(await screen.findByText(/Priya owes you/)).toBeInTheDocument()
        cleanup()

        await remove(me.email, id, gone)
        renderGroup(id)

        expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
        expect(screen.queryByText(/owes you/)).not.toBeInTheDocument()
        expect(screen.queryByText('No expenses yet')).not.toBeInTheDocument()
        expect(await expenseRows()).toEqual(["Oct | 8 | You deleted 'Dinner' (£30.00)"])
      })

      it('keeps its place when another expense of the day is added after it', async () => {
        const id = await createGroup(me, { name: 'Goa trip' })
        const first = await addExpense(me.email, id, { description: 'First', date: '2026-10-08' })
        await addExpense(me.email, id, { description: 'Second', date: '2026-10-08' })
        await remove(me.email, id, first)
        renderGroup(id)

        const rows = await expenseRows()
        expect(rows[0]).toMatch(/Second/)
        expect(rows[1]).toBe("Oct | 8 | You deleted 'First' (£30.00)")
      })

      it('is a normal row again, in its own place, once it is restored, and counts towards the balance', async () => {
        const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
        await addExpense(me.email, id, { description: 'Taxi', date: '2026-10-08', amountMinor: 1000 })
        const back = await addExpense(me.email, id, { description: 'Dinner', date: '2026-10-05' })
        await remove(me.email, id, back)
        await expenseService.restoreExpense(testDb.db, await personIdOf(testDb.db, me.email), id, back)
        renderGroup(id)

        expect(await expenseRows()).toEqual([
          'Oct | 8 | Taxi | You paid £10.00 | you lent | £5.00',
          'Oct | 5 | Dinner | You paid £30.00 | you lent | £15.00',
        ])
        expect(screen.queryByRole('img', { name: 'Deleted' })).not.toBeInTheDocument()
        expect(screen.queryByText(/You deleted/)).not.toBeInTheDocument()
        expect(await screen.findByText(/Priya owes you/)).toBeInTheDocument()
      })

      it('opens the deleted expense when its line is tapped', async () => {
        const id = await createGroup(me, { name: 'Goa trip' })
        const gone = await addExpense(me.email, id)
        await remove(me.email, id, gone)
        const { currentPath } = renderGroup(id)

        await userEvent.click(await screen.findByText("You deleted 'Dinner' (£30.00)"))

        expect(currentPath()).toBe(ROUTES.expense(id, gone))
      })
    })

    it('opens a payment\'s details when its row is tapped', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const expenseId = await addTestSettlement(testDb.db, me.email, 'priya@gmail.com', id)
      const { currentPath } = renderGroup(id)

      // The amount is a piece of its own (it travels into the payment's band, PRD 5.16), so the line is found by its start.
      await userEvent.click(await screen.findByText(/^You paid Priya/))

      expect(currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it('shows the balance a payment leaves, and the date column keeps its 48 px height', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id, { description: 'Dinner' })
      await addTestSettlement(testDb.db, 'priya@gmail.com', me.email, id, { amountMinor: 1500 })
      renderGroup(id)

      expect(await screen.findByText("You're all settled up")).toBeInTheDocument()
      const [dateColumn] = (await screen.findAllByText('Oct')).map((month) => month.parentElement as HTMLElement)
      expect(dateColumn).toHaveStyle({ height: '48px' })
    })

    it('puts a "month year" header above the expenses of each month, even the newest', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      await addExpense(me.email, id, { description: 'Old hotel', date: '2025-09-23' })
      await addExpense(me.email, id, { description: 'Taxi', date: '2026-10-12' })
      await addExpense(me.email, id, { description: 'Dinner', date: '2026-10-14' })
      await addExpense(me.email, id, { description: 'Hotel', date: '2026-08-30' })
      renderGroup(id)

      await expenseRows()
      const expenses = screen.getByRole('region', { name: 'Expenses' })
      const headings = within(expenses).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
      expect(headings).toEqual(['October 2026', 'August 2026', 'September 2025'])

      // Each month's rows are in the list its header names, newest first.
      const rowsOf = (month: string) =>
        within(screen.getByRole('list', { name: month }))
          .getAllByRole('listitem')
          .map((row) => row.textContent)
      expect(rowsOf('October 2026')).toEqual([expect.stringContaining('Dinner'), expect.stringContaining('Taxi')])
      expect(rowsOf('August 2026')).toEqual([expect.stringContaining('Hotel')])
      expect(rowsOf('September 2025')).toEqual([expect.stringContaining('Old hotel')])
    })

    it('shows no expense list, so no month header, when there are no expenses', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      renderGroup(id)

      await screen.findByText('No expenses yet')
      expect(screen.queryByRole('region', { name: 'Expenses' })).not.toBeInTheDocument()
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

    it('opens an expense\'s details when its row is tapped', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const expenseId = await addExpense(me.email, id, { description: 'Taxi' })
      const { currentPath } = renderGroup(id)

      await userEvent.click(await screen.findByRole('link', { name: /Taxi/ }))

      expect(currentPath()).toBe(ROUTES.expense(id, expenseId))
    })

    it('shows lent amounts in green', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      await addExpense(me.email, id)
      renderGroup(id)

      const lent = (await screen.findByText('you lent')).parentElement as HTMLElement
      expect(lent).toHaveStyle({ color: 'rgb(47, 158, 68)' })
    })

    it('says "no balance" for an expense you paid for yourself alone, in a group of several', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const meId = await personIdOf(testDb.db, me.email)
      const priyaId = await personIdOf(testDb.db, priya.email)
      await addExpense(me.email, id, { split: { method: 'equal', values: { [meId]: 1, [priyaId]: 0 } } })
      renderGroup(id)

      expect(await expenseRows()).toEqual(['Oct | 8 | Dinner | You paid £30.00 | no balance'])
    })

    it('shows just the amount for an expense in a group where you are the only member', async () => {
      const id = await createGroup(me, { name: 'Solo' })
      await addExpense(me.email, id)
      renderGroup(id)

      expect(await expenseRows()).toEqual(['Oct | 8 | Dinner | You paid £30.00 | £30.00'])
    })

    it('says "not involved" for an expense you have no part in', async () => {
      const id = await createGroup(me, { name: 'Goa trip', memberEmails: ['priya@gmail.com'] })
      const expenseId = await addExpense(me.email, id)
      // As if Priya had paid and the split left you out.
      const [priyaRow] = await testDb.db.select().from(people).where(eq(people.email, priya.email))
      await testDb.db.update(expenseShares).set({ paidMinor: 3000, owedMinor: 3000 }).where(eq(expenseShares.personId, priyaRow.id))
      await testDb.db.update(expenseShares).set({ deletedAt: new Date() }).where(and(eq(expenseShares.expenseId, expenseId), ne(expenseShares.personId, priyaRow.id)))
      renderGroup(id)

      expect(await expenseRows()).toEqual(['Oct | 8 | Dinner | Priya paid £30.00 | not involved'])
    })
  })

  describe('the members', () => {
    it('stays closed until the "N members" chip is pressed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await screen.findByRole('button', { name: named('2 members') })

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

      await waitFor(() => expect(membersSheetIsClosed()).toBe(true))
    })

    it('closes when the dimmed area outside it is pressed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      await openMembers(2)

      await userEvent.click(document.querySelector('.ant-drawer-mask') as HTMLElement)

      await waitFor(() => expect(membersSheetIsClosed()).toBe(true))
    })

    it('can be opened again after it was closed', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(2)
      await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(membersSheetIsClosed()).toBe(true))

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

    it('shows "No email" under the name of a member who has none, and keeps them Pending', async () => {
      const rahul = await addTestPerson(testDb.db, me, { name: 'Rahul' })
      const id = await createGroup(me, { name: 'Goa', memberIds: [rahul], memberEmails: ['priya@gmail.com'] })
      renderGroup(id)
      const sheet = await openMembers(3)

      expect(memberRows(sheet)).toEqual([
        ['Omkar Sheral', 'omkar@gmail.com', 'You'],
        ['priya@gmail.com', null, 'Pending'],
        ['Rahul', 'No email', 'Pending'],
      ])
      expect(initialsOf(sheet)).toEqual(['O', 'P', 'R'])
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

      // The page shows the records as they are: the gate (not this page) is what
      // gives the user their name from Google when they open the app.
      expect(memberRows(sheet)).toEqual([
        ['omkar@gmail.com', null, 'You'],
        ['Priya', 'priya@gmail.com', 'Pending'],
      ])
    })

    it('shows a guest as "Guest" with no email, tagged You', async () => {
      useAuthStore.setState({ profile: null, guest: true })
      await testDb.db.insert(people).values({ id: GUEST_PERSON_ID, name: 'Guest', email: null, updatedBy: GUEST_PERSON_ID })
      const rahul = await addTestPerson(testDb.db, me, { name: 'Rahul' })
      const result = await groupService.createGroup(testDb.db, GUEST_PERSON_ID, {
        name: 'Goa',
        type: 'trip',
        defaultCurrency: 'GBP',
        memberIds: [rahul],
      })
      if (!result.ok) throw new Error(JSON.stringify(result.errors))
      renderGroup(result.groupId)
      const sheet = await openMembers(2)

      expect(memberRows(sheet)).toEqual([
        ['Guest', 'No email', 'You'],
        ['Rahul', 'No email', 'Pending'],
      ])
    })

    it('names you by the name saved for you', async () => {
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
      expect(screen.queryByRole('button', { name: named('(members|member)') })).not.toBeInTheDocument()

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
      expectCenteredMessage(screen.getByText("Couldn't load this group"))
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
      const message = await screen.findByText('Group not found', { selector: '.ant-result-title' })
    expectCenteredMessage(message)
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
