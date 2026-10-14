// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabaseSession } from '../../../hooks/useDatabaseSession'
import type { DatabaseSessionState } from '../../../hooks/useDatabaseSession/types.ts'
import { ROUTES } from '../../../routes.ts'
import { useAuthStore } from '../../../stores/useAuthStore'
import { SignedInLayout } from '../index.tsx'
import { expectCenteredMessage } from '../../../testing/centered.ts'

// Opening the database needs IndexedDB and the browser's tab lock, which jsdom
// does not have, so the hook that does it is replaced by a state chosen per test.
vi.mock('../../../hooks/useDatabaseSession', () => ({ useDatabaseSession: vi.fn() }))

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const accountMenu = () => screen.queryAllByRole('button', { name: 'Account menu' })

function setDatabase(state: DatabaseSessionState) {
  vi.mocked(useDatabaseSession).mockReturnValue({ state, retry: vi.fn() })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SignedInLayout />}>
          {[ROUTES.home, ROUTES.newGroup, ROUTES.groupPattern, ROUTES.newExpensePattern, ROUTES.expensePattern].map(
            (route) => (
              <Route key={route} path={route} element={<div>Page: {route}</div>} />
            ),
          )}
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('SignedInLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({ profile, token: null })
    setDatabase({ status: 'ready', db: {} as never })
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  describe('once the data is open', () => {
    it('shows the header on the home page, once', () => {
      renderAt(ROUTES.home)

      expect(screen.getByText(`Page: ${ROUTES.home}`)).toBeInTheDocument()
      expect(accountMenu()).toHaveLength(1)
      expect(screen.getByRole('link', { name: /ownledger/i })).toHaveAttribute('href', ROUTES.home)
    })

    it('fills at least the height of the screen, so a page can fill what is left below its header', () => {
      const view = renderAt(ROUTES.home)

      expect(view.container.firstElementChild).toHaveClass('ant-flex-vertical')
      expect(view.container.firstElementChild).toHaveStyle({ minHeight: '100dvh' })
    })

    it.each([
      ['create group', ROUTES.newGroup, ROUTES.newGroup],
      ['a group', ROUTES.group('abc'), ROUTES.groupPattern],
      ['add expense', ROUTES.newExpense('abc'), ROUTES.newExpensePattern],
      ['an expense', ROUTES.expense('abc', 'def'), ROUTES.expensePattern],
    ])('has no header on the page of %s', (_name, path, pattern) => {
      renderAt(path)

      expect(screen.getByText(`Page: ${pattern}`)).toBeInTheDocument()
      expect(accountMenu()).toHaveLength(0)
      expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    })
  })

  describe('while the data cannot be used', () => {
    it.each([
      ['is loading', { status: 'loading' } as const, 'Opening your data…'],
      ['is open in another tab', { status: 'locked' } as const, 'OwnLedger is open in another tab'],
      ['fails to open', { status: 'error', error: new Error('boom') } as const, "Couldn't open your data"],
    ])('shows the header on every page when the data %s', (_name, state, message) => {
      for (const path of [ROUTES.home, ROUTES.newGroup, ROUTES.group('abc'), ROUTES.expense('abc', 'def')]) {
        setDatabase(state)
        const view = renderAt(path)

        expect(screen.getByText(message)).toBeInTheDocument()
        expectCenteredMessage(screen.getByText(message))
        expect(accountMenu()).toHaveLength(1)
        expect(screen.queryByText(/^Page: /)).not.toBeInTheDocument()
        view.unmount()
      }
    })
  })
})
