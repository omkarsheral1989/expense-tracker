// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../../db/client.ts'
import { groupMembers, groups, people } from '../../../db/schema.ts'
import { ROUTES } from '../../../routes.ts'
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
    routes: [ROUTES.home],
  })
}

/** The rows of the member list: [name or email, email line or null, tag]. */
function memberRows() {
  const card = screen.getByText(/^Members \(/).closest('.ant-card') as HTMLElement
  return [...card.querySelectorAll('.ant-tag')].map((tag) => {
    const row = tag.parentElement as HTMLElement
    const texts = [...row.querySelectorAll('.ant-typography')].map((text) => text.textContent)
    return [texts[0], texts[1] ?? null, tag.textContent]
  })
}

describe('GroupPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ profile: me, token: null })
  })
  afterEach(() => {
    cleanup()
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

  describe('the group\'s details', () => {
    it('shows its name, type and default currency', async () => {
      const id = await createGroup(me, { name: 'Goa trip', type: 'couple', defaultCurrency: 'EUR' })
      renderGroup(id)

      expect(await screen.findByRole('heading', { name: 'Goa trip' })).toBeInTheDocument()
      expect(screen.getByText('Couple · EUR')).toBeInTheDocument()
    })

    it.each([
      ['trip', 'Trip'],
      ['home', 'Home'],
      ['couple', 'Couple'],
      ['other', 'Other'],
    ] as const)('shows the %s icon for a %s group', async (type, label) => {
      const id = await createGroup(me, { name: 'A group', type })
      renderGroup(id)

      await screen.findByRole('heading', { name: 'A group' })
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
      expect(screen.getByText(`${label} · GBP`)).toBeInTheDocument()
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

    it('goes back to the home page with the Back button', async () => {
      const id = await createGroup(me, { name: 'Goa trip' })
      const page = renderGroup(id)
      await screen.findByRole('heading', { name: 'Goa trip' })

      await userEvent.click(screen.getByRole('button', { name: 'Back' }))

      expect(page.currentPath()).toBe(ROUTES.home)
    })
  })

  describe('the members', () => {
    it('counts the members in the heading of the list', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      renderGroup(id)

      expect(await screen.findByText('Members (3)')).toBeInTheDocument()
    })

    it('lists you first, then the others A to Z, with a name and an email each', async () => {
      const id = await createGroup(me, {
        name: 'Goa',
        memberEmails: ['zed@gmail.com', 'priya@gmail.com', 'amy@gmail.com'],
      })
      await testDb.db.update(people).set({ name: 'Zoe' }).where(eq(people.email, 'amy@gmail.com'))
      await testDb.db.update(people).set({ name: 'Bea' }).where(eq(people.email, 'zed@gmail.com'))
      renderGroup(id)
      await screen.findByText('Members (4)')

      expect(memberRows().map(([primary]) => primary)).toEqual([
        'Omkar Sheral',
        'Bea',
        'priya@gmail.com',
        'Zoe',
      ])
    })

    it('tags you as "You" and everyone else as "Pending"', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      renderGroup(id)
      await screen.findByText('Members (3)')

      expect(memberRows().map(([, , tag]) => tag)).toEqual(['You', 'Pending', 'Pending'])
      expect(screen.getAllByText('You')).toHaveLength(1)
    })

    it('shows a member\'s name with their email under it, and just the email when there is no name', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      await testDb.db.update(people).set({ name: 'Priya Shah' }).where(eq(people.email, 'priya@gmail.com'))
      renderGroup(id)
      await screen.findByText('Members (3)')

      expect(memberRows()).toEqual([
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
      await screen.findByText('Members (2)')

      const card = screen.getByText(/^Members \(/).closest('.ant-card') as HTMLElement
      const initials = [...card.querySelectorAll('.ant-avatar')].map((avatar) => avatar.textContent)
      expect(initials).toEqual(['O', 'P'])
    })

    it('does not list a member who has left', async () => {
      const id = await createGroup(me, { name: 'Goa', memberEmails: ['priya@gmail.com', 'sam@gmail.com'] })
      const [sam] = await testDb.db.select({ id: people.id }).from(people).where(eq(people.email, 'sam@gmail.com'))
      await testDb.db.update(groupMembers).set({ deletedAt: new Date() }).where(eq(groupMembers.personId, sam.id))
      renderGroup(id)

      expect(await screen.findByText('Members (2)')).toBeInTheDocument()
      expect(screen.queryByText('sam@gmail.com')).not.toBeInTheDocument()
    })

    it('shows the group from the point of view of whoever opens it', async () => {
      const id = await createGroup(priya, { name: 'Flat', memberEmails: ['omkar@gmail.com'] })
      renderGroup(id)
      await screen.findByText('Members (2)')

      // The user's own record has no name (Priya added them by email), so the
      // name comes from their Google profile.
      expect(memberRows()).toEqual([
        ['Omkar Sheral', 'omkar@gmail.com', 'You'],
        ['Priya', 'priya@gmail.com', 'Pending'],
      ])
    })

    it('prefers the name saved for you over the one from your Google profile', async () => {
      const id = await createGroup(me, { name: 'Goa' })
      await testDb.db.update(people).set({ name: 'Omkar S.' }).where(eq(people.email, me.email))
      renderGroup(id)
      await screen.findByText('Members (1)')

      expect(memberRows()).toEqual([['Omkar S.', 'omkar@gmail.com', 'You']])
    })
  })

  describe('a group that is not there for this user', () => {
    async function expectNotFound(page: ReturnType<typeof renderGroup>) {
      expect(await screen.findByText('Group not found')).toBeInTheDocument()
      expect(screen.queryByText(/^Members \(/)).not.toBeInTheDocument()

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
