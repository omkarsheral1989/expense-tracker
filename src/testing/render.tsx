import { render } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ThemeProvider } from '../components/ThemeProvider'
import { CurrentPath } from './CurrentPath.tsx'

/**
 * Renders a page the way the app does: inside the theme and a router, starting
 * at `path`. The page is mounted at `pattern`, which defaults to `path` with a
 * trailing id turned into `:id`. `routes` lists the other paths the page can navigate to; they show
 * a plain placeholder, and `currentPath()` says where the app ended up.
 */
export function renderPage(
  page: ReactElement,
  {
    path = '/',
    pattern,
    routes = [],
  }: { path?: string; pattern?: string; routes?: string[] } = {},
) {
  const result = render(
    // Animations off, so a closed dialog or a cleared message is gone at once
    // instead of lingering on screen while it "animates" in jsdom.
    <ConfigProvider theme={{ zeroRuntime: true, token: { motion: false } }}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path={pattern ?? path.replace(/\/[0-9a-f-]{36}$/i, '/:id')}
              element={page}
            />
            {routes.map((route) => (
              <Route key={route} path={route} element={<div>Page: {route}</div>} />
            ))}
          </Routes>
          <CurrentPath />
        </MemoryRouter>
      </ThemeProvider>
    </ConfigProvider>,
  )

  return {
    ...result,
    currentPath: () => result.getByTestId('current-path').textContent,
  }
}
