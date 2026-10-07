import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ThemeProvider } from '../components/ThemeProvider'
import { CurrentPath } from './CurrentPath.tsx'

/**
 * Renders a page the way the app does: inside the theme and a router, starting
 * at `path`. `routes` lists the other paths the page can navigate to; they show
 * a plain placeholder, and `currentPath()` says where the app ended up.
 */
export function renderPage(
  page: ReactElement,
  { path = '/', routes = [] }: { path?: string; routes?: string[] } = {},
) {
  const result = render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path.replace(/\/[0-9a-f-]{36}$/i, '/:id')} element={page} />
          {routes.map((route) => (
            <Route key={route} path={route} element={<div>Page: {route}</div>} />
          ))}
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    </ThemeProvider>,
  )

  return {
    ...result,
    currentPath: () => result.getByTestId('current-path').textContent,
  }
}
