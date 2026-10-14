// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../../stores/useAuthStore'
import { RequireAuth } from '../index.tsx'

const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/" element={<div>Welcome</div>} />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <div>Inside</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => useAuthStore.setState({ profile: null, guest: false, token: null }))
  afterEach(cleanup)

  it('lets a signed-in user in', () => {
    useAuthStore.setState({ profile })
    renderGuarded()
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  it('lets a guest in', () => {
    useAuthStore.setState({ guest: true })
    renderGuarded()
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  it('sends anyone else back to the welcome page', () => {
    renderGuarded()
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.queryByText('Inside')).not.toBeInTheDocument()
  })
})
