// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { getDb } from '../../../db/client.ts'
import { sharedFiles, type SharedItems } from '../../../pwa/sharedFiles.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { captureLogs, messagesOf } from '../../../testing/logs.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AddExpensePage } from '../../addExpense'
import { SharePage } from '../index.tsx'

// Pages reach the database through `getDb`; point it at the in-memory one.
vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const me = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const testDb = setUpTestDatabase()
const logs = captureLogs()

function shared(overrides: Partial<SharedItems> = {}): SharedItems {
  return {
    pictures: [{ name: 'receipt.png', type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer }],
    notes: 'Dinner\nBeach shack',
    leftOut: 0,
    sharedAt: Date.now(),
    ...overrides,
  }
}

async function createGroup(name: string, defaultCurrency = 'GBP') {
  const result = await createTestGroup(testDb.db, me, { name, type: 'trip', defaultCurrency, memberEmails: [] })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.groupId
}

/** The landing page, with the real add-expense page and a placeholder home page to land on. */
function renderShare() {
  return renderPage(
    <Routes>
      <Route path={ROUTES.share} element={<SharePage />} />
      <Route path={ROUTES.newExpensePattern} element={<AddExpensePage />} />
      <Route path={ROUTES.home} element={<div>Page: home</div>} />
    </Routes>,
    { path: ROUTES.share, pattern: '/*' },
  )
}

describe('SharePage', () => {
  beforeEach(async () => {
    useAuthStore.setState({ profile: me, token: null })
    await sharedFiles.clear()
    logs.clear()
  })
  afterEach(async () => {
    cleanup()
    await sharedFiles.clear()
  })

  it('opens add expense for the most recently active group with the pictures as receipts and the text as notes', async () => {
    await createGroup('Old trip')
    const recent = await createGroup('Goa trip', 'INR')
    await addTestExpense(testDb.db, me.email, recent, { description: 'Taxi', amountMinor: 500 })
    await sharedFiles.save(shared())
    const { currentPath } = renderShare()

    expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
    expect(currentPath()).toBe(ROUTES.newExpense(recent))
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Dinner\nBeach shack')
    expect(screen.getByRole('button', { name: 'Remove receipt photo 1' })).toBeInTheDocument()
    // Nothing else is filled in, and the currency is the group's.
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /Goa trip/ })).toBeInTheDocument()
  })

  it('removes the held share once it has been taken', async () => {
    await createGroup('Goa trip')
    await sharedFiles.save(shared())
    renderShare()

    await screen.findByRole('heading', { name: 'Add expense' })
    await waitFor(async () => expect(await sharedFiles.read()).toBeNull())
  })

  it('says so, drops the pictures and opens the home page when the user has no groups', async () => {
    await sharedFiles.save(shared())
    const { currentPath } = renderShare()

    expect(await screen.findByText('Create a group first to add a shared receipt.')).toBeInTheDocument()
    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
    await waitFor(async () => expect(await sharedFiles.read()).toBeNull())
  })

  it('opens the home page when nothing is held (the address opened by hand)', async () => {
    await createGroup('Goa trip')
    const { currentPath } = renderShare()

    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
  })

  it('opens the home page for a share older than an hour', async () => {
    await createGroup('Goa trip')
    await sharedFiles.save(shared({ sharedAt: Date.now() - 2 * 60 * 60 * 1000 }))
    const { currentPath } = renderShare()

    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
  })

  it('warns when pictures were left out beyond the limit of 10', async () => {
    await createGroup('Goa trip')
    await sharedFiles.save(shared({ leftOut: 2 }))
    renderShare()

    expect(await screen.findByText('An expense can have up to 10 photos.')).toBeInTheDocument()
  })

  it('accepts a text-only share: notes filled in and no photos', async () => {
    await createGroup('Goa trip')
    await sharedFiles.save(shared({ pictures: [], notes: 'hello' }))
    renderShare()

    expect(await screen.findByRole('heading', { name: 'Add expense' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('hello')
    expect(screen.queryByRole('button', { name: /Remove receipt photo/ })).not.toBeInTheDocument()
  })

  it('opens the home page when the data cannot be read', async () => {
    await sharedFiles.save(shared())
    vi.mocked(getDb).mockRejectedValueOnce(new Error('database is closed'))
    const { currentPath } = renderShare()

    await waitFor(() => expect(currentPath()).toBe(ROUTES.home))
  })

  describe('logging', () => {
    it('logs where the share went, with counts and the group id but no names or text', async () => {
      const groupId = await createGroup('Secret party')
      await sharedFiles.save(shared({ notes: 'Private note', leftOut: 1 }))
      renderShare()
      await screen.findByRole('heading', { name: 'Add expense' })

      const opened = logs.lines.find((line) => line.message === 'Share opened in Add expense')
      expect(opened).toMatchObject({ level: 'info', scope: 'share', fields: { groupId, pictures: 1, leftOut: 1 } })
      const text = JSON.stringify(logs.lines)
      for (const secret of ['Secret party', 'Private note', 'receipt.png']) expect(text).not.toContain(secret)
    })

    it('logs that the share was dropped when there is no group', async () => {
      await sharedFiles.save(shared())
      renderShare()
      await screen.findByText('Create a group first to add a shared receipt.')
      expect(messagesOf(logs.lines)).toContain('share: Share dropped, the user has no group')
    })

    it('logs when the page opens with nothing held', async () => {
      renderShare()
      await waitFor(() => expect(messagesOf(logs.lines)).toContain('share: Share page opened with nothing held, going home'))
    })
  })
})
