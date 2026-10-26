import { render } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryProvider } from '../components/QueryProvider'
import { ThemeProvider } from '../components/ThemeProvider'
import { CurrentUserContext } from '../hooks/useCurrentUser/context.ts'
import type { CurrentUser } from '../hooks/useCurrentUser/types.ts'
import { useAuthStore } from '../stores/useAuthStore'
import { personIdForEmail } from './ids.ts'
import { CurrentPath } from './CurrentPath.tsx'

/**
 * Renders a page the way the app does: inside the theme and a router, starting
 * at `path`. The page is mounted at `pattern`, which defaults to `path` with a
 * trailing id turned into `:id`. `routes` lists the other paths the page can navigate to; they show
 * a plain placeholder, and `currentPath()` says where the app ended up. `state` is
 * the router state the page is opened with, as a link's `state` gives it, and
 * `extra` lists other routes with a page of the test's own to show.
 *
 * The page is given the current user the way `DatabaseGate` gives it: from the
 * auth store's profile (a Google user, whose person id is `personIdForEmail`) or
 * guest flag, read when the page is rendered. With neither, there is no user.
 */
export function renderPage(
  page: ReactElement,
  {
    path = '/',
    pattern,
    routes = [],
    state,
    extra = [],
  }: { path?: string; pattern?: string; routes?: string[]; state?: unknown; extra?: { path: string; element: ReactElement }[] } = {},
) {
  const result = render(
    <CurrentUserContext.Provider value={currentUserOf(useAuthStore.getState())}>
    {/* Animations off, so a closed dialog or a cleared message is gone at once
        instead of lingering on screen while it "animates" in jsdom. */}
    <ConfigProvider theme={{ zeroRuntime: true, token: { motion: false } }}>
      <ThemeProvider>
        <QueryProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route
              path={pattern ?? path.replace(/\/[0-9a-f-]{36}$/i, '/:id')}
              element={page}
            />
            {extra.map(({ path: extraPath, element }) => (
              <Route key={extraPath} path={extraPath} element={element} />
            ))}
            {routes.map((route) => (
              <Route key={route} path={route} element={<div>Page: {route}</div>} />
            ))}
          </Routes>
          <CurrentPath />
        </MemoryRouter>
        </QueryProvider>
      </ThemeProvider>
    </ConfigProvider>
    </CurrentUserContext.Provider>,
  )

  return {
    ...result,
    currentPath: () => result.getByTestId('current-path').textContent,
  }
}

/** The person of the guest that `renderPage` gives a page when the auth store says guest. */
export const GUEST_PERSON_ID = personIdForEmail('guest')

function currentUserOf({ profile, guest }: ReturnType<typeof useAuthStore.getState>): CurrentUser | null {
  if (profile) {
    return {
      personId: personIdForEmail(profile.email),
      name: profile.name,
      email: profile.email,
      isGuest: false,
      datasetId: profile.id,
    }
  }
  if (guest) return { personId: GUEST_PERSON_ID, name: 'Guest', email: null, isGuest: true, datasetId: 'guest-dataset' }
  return null
}
