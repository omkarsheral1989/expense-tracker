// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useDatabaseSession } from '../../../hooks/useDatabaseSession'
import type { DatabaseSessionState } from '../../../hooks/useDatabaseSession/types.ts'
import { deviceService } from '../../../services/deviceService'
import { userService } from '../../../services/userService'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useSyncStore } from '../../../stores/useSyncStore'
import { renderPage } from '../../../testing/render.tsx'
import { DatabaseGate } from '../index.tsx'

// Opening the database needs IndexedDB and the browser's tab lock, which jsdom
// does not have, so the hook that does it is replaced by a state chosen per test.
vi.mock('../../../hooks/useDatabaseSession', () => ({ useDatabaseSession: vi.fn() }))
vi.mock('../../../services/userService', () => ({
  userService: { guestName: 'Guest', resolve: vi.fn() },
}))

const profile = { id: 'g-omkar', email: 'omkar@gmail.com', name: 'Omkar Sheral' }
const db = {} as never

function setDatabase(state: DatabaseSessionState, retry = vi.fn()) {
  vi.mocked(useDatabaseSession).mockReturnValue({ state, retry })
  return retry
}

/** Shows who the pages inside the gate would see as the current user. */
function WhoAmI() {
  const user = useCurrentUser()
  return <div>{user ? `${user.name}|${user.email}|${user.isGuest}|${user.personId}|${user.datasetId}` : 'nobody'}</div>
}

function renderGate() {
  return renderPage(
    <DatabaseGate header={<div>Header</div>}>
      <WhoAmI />
    </DatabaseGate>,
  )
}

describe('DatabaseGate', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ profile: null, guest: false, token: null })
    setDatabase({ status: 'ready', db })
    vi.mocked(userService.resolve).mockResolvedValue({ personId: 'person-1', name: 'Omkar Sheral', email: 'omkar@gmail.com' })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows nothing for a visitor who is neither signed in nor a guest', () => {
    renderGate()
    expect(screen.queryByText('Header')).not.toBeInTheDocument()
    expect(screen.queryByText('nobody')).not.toBeInTheDocument()
    expect(useDatabaseSession).not.toHaveBeenCalled()
  })

  describe('for a guest', () => {
    beforeEach(() => useAuthStore.setState({ guest: true }))

    it('opens the guest\'s dataset, finds their person, and shows the pages as that guest', async () => {
      vi.mocked(userService.resolve).mockResolvedValue({ personId: 'person-guest', name: 'Guest', email: null })
      renderGate()

      const record = deviceService.read()!
      expect(record.owner).toBeNull()
      expect(useDatabaseSession).toHaveBeenCalledWith(record.datasetId)
      expect(userService.resolve).toHaveBeenCalledWith(db, record, null)
      expect(await screen.findByText(`Guest|null|true|person-guest|${record.datasetId}`)).toBeInTheDocument()
    })

    it('opens the same dataset every time', async () => {
      renderGate()
      const first = deviceService.read()!.datasetId
      cleanup()
      renderGate()
      expect(deviceService.read()!.datasetId).toBe(first)
      await screen.findByText(/true\|/)
    })

    it('opens the data of an account that signed out, so the guest sees everything', async () => {
      deviceService.forGoogle(profile)
      renderGate()

      expect(useDatabaseSession).toHaveBeenCalledWith('g-omkar')
      expect(await screen.findByText(/\|true\|person-1\|g-omkar/)).toBeInTheDocument()
    })
  })

  describe('for a signed-in user', () => {
    beforeEach(() => useAuthStore.setState({ profile }))

    it('opens the account\'s data, finds their person, and shows the pages as that user', async () => {
      renderGate()

      expect(useDatabaseSession).toHaveBeenCalledWith('g-omkar')
      expect(userService.resolve).toHaveBeenCalledWith(db, deviceService.read(), profile)
      expect(await screen.findByText('Omkar Sheral|omkar@gmail.com|false|person-1|g-omkar')).toBeInTheDocument()
    })

    it('remembers who their person is, when it has just been found', async () => {
      renderGate()
      await screen.findByText(/person-1/)

      expect(deviceService.read()?.userPersonId).toBe('person-1')
    })

    it('finds their person again after a sync or restore, which may have given it another id', async () => {
      renderGate()
      await screen.findByText(/person-1/)
      vi.mocked(userService.resolve).mockResolvedValue({ personId: 'person-2', name: 'Omkar Sheral', email: 'omkar@gmail.com' })

      act(() => useSyncStore.getState().finish())

      expect(await screen.findByText(/person-2/)).toBeInTheDocument()
      expect(deviceService.read()?.userPersonId).toBe('person-2')
    })

    it('makes the account the owner of a guest\'s data', async () => {
      const guest = deviceService.forGuest()
      renderGate()
      await screen.findByText(/person-1/)

      expect(useDatabaseSession).toHaveBeenCalledWith(guest.datasetId)
      expect(deviceService.read()?.owner).toEqual({ accountId: 'g-omkar', email: 'omkar@gmail.com' })
    })

    it('refuses an account that does not own the data on this device, and opens nothing', async () => {
      deviceService.forGoogle({ id: 'g-priya', email: 'priya@gmail.com', name: 'Priya' })
      renderGate()

      expect(screen.getByText('This device is already used by another account')).toBeInTheDocument()
      expect(screen.getByText(/belongs to priya@gmail.com/)).toBeInTheDocument()
      expect(screen.getByText('Header')).toBeInTheDocument()
      expect(useDatabaseSession).not.toHaveBeenCalled()
      expect(screen.queryByText('nobody')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(useAuthStore.getState().profile).toBeNull()
    })
  })

  describe('while the data cannot be used', () => {
    beforeEach(() => useAuthStore.setState({ profile }))

    it('shows a loading screen under the header while the data opens', () => {
      setDatabase({ status: 'loading' })
      renderGate()
      expect(screen.getByText('Opening your data…')).toBeInTheDocument()
      expect(screen.getByText('Header')).toBeInTheDocument()
    })

    it('says the app is open in another tab, and tries again', async () => {
      const retry = setDatabase({ status: 'locked' })
      renderGate()

      expect(screen.getByText('OwnLedger is open in another tab')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(retry).toHaveBeenCalled()
    })

    it('says the data could not be opened, with Sign out for an account', async () => {
      setDatabase({ status: 'error', error: new Error('boom') })
      renderGate()

      expect(screen.getByText("Couldn't open your data")).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(useAuthStore.getState().profile).toBeNull()
    })

    it('offers a guest Exit guest mode instead of Sign out', async () => {
      useAuthStore.setState({ profile: null, guest: true })
      setDatabase({ status: 'error', error: new Error('boom') })
      renderGate()

      await userEvent.click(screen.getByRole('button', { name: 'Exit guest mode' }))
      expect(useAuthStore.getState().guest).toBe(false)
    })

    it('says so, with Try again, when the user\'s person cannot be found, and tries again', async () => {
      vi.mocked(userService.resolve).mockRejectedValueOnce(new Error('database is closed'))
      renderGate()

      expect(await screen.findByText("Couldn't open your data")).toBeInTheDocument()
      expect(screen.getByText('Header')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText(/person-1/)).toBeInTheDocument()
      expect(userService.resolve).toHaveBeenCalledTimes(2)
    })

    it('waits for the user\'s person before showing the pages', async () => {
      vi.mocked(userService.resolve).mockReturnValue(new Promise(() => {}))
      renderGate()

      expect(screen.getByText('Opening your data…')).toBeInTheDocument()
      await waitFor(() => expect(userService.resolve).toHaveBeenCalled())
      expect(screen.queryByText(/person-1/)).not.toBeInTheDocument()
    })
  })
})
