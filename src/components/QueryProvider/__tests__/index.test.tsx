// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dataChanges } from '../../../db/changes.ts'
import { useCachedData } from '../../../hooks/useCachedData'
import { useAuthStore } from '../../../stores/useAuthStore'
import { captureLogs } from '../../../testing/logs.ts'
import { QueryProvider } from '../index.tsx'

const logs = captureLogs()
const profile = { id: '1', email: 'omkar@gmail.com', name: 'Omkar' }

beforeEach(() => {
  useAuthStore.setState({ profile: null, guest: false, token: null, driveToken: null })
  logs.clear()
})
afterEach(cleanup)

/** A page reading a counter: it shows the number it read, or "loading". */
function Page({ name, read }: { name: string; read: () => Promise<number> }) {
  const { state } = useCachedData(read, 'test', name)
  return <p>{`${name}: ${state.status === 'ready' ? state.data : state.status}`}</p>
}

function setUp() {
  let value = 1
  const read = vi.fn(async () => value)
  const setValue = (next: number) => (value = next)
  return { read, setValue }
}

describe('QueryProvider', () => {
  it('refreshes the page on screen in place when the data changes', async () => {
    const { read, setValue } = setUp()
    render(
      <QueryProvider>
        <Page name="home" read={read} />
      </QueryProvider>,
    )
    expect(await screen.findByText('home: 1')).toBeInTheDocument()

    setValue(2)
    act(() => dataChanges.announce())

    // Never goes back to loading: the old number stays until the new one is in.
    expect(screen.queryByText('home: loading')).not.toBeInTheDocument()
    expect(await screen.findByText('home: 2')).toBeInTheDocument()
  })

  it('forgets what pages not on screen remembered, so they read fresh when opened', async () => {
    const { read, setValue } = setUp()
    const view = render(
      <QueryProvider>
        <Page name="group" read={read} />
      </QueryProvider>,
    )
    await screen.findByText('group: 1')
    // The page is left (another page is open) and the data changes meanwhile.
    view.rerender(
      <QueryProvider>
        <p>elsewhere</p>
      </QueryProvider>,
    )
    setValue(2)
    act(() => dataChanges.announce())

    view.rerender(
      <QueryProvider>
        <Page name="group" read={read} />
      </QueryProvider>,
    )

    // Not the old 1: nothing is remembered for it now.
    expect(screen.getByText('group: loading')).toBeInTheDocument()
    expect(await screen.findByText('group: 2')).toBeInTheDocument()
  })

  it('does not refresh anything for a change announced before it was mounted, or after it is gone', async () => {
    const { read } = setUp()
    act(() => dataChanges.announce())
    const view = render(
      <QueryProvider>
        <Page name="home" read={read} />
      </QueryProvider>,
    )
    await screen.findByText('home: 1')
    const reads = read.mock.calls.length
    view.unmount()
    act(() => dataChanges.announce())
    expect(read.mock.calls.length).toBe(reads)
  })

  describe('who is using the app', () => {
    async function remembered() {
      const { read } = setUp()
      const view = render(
        <QueryProvider>
          <Page name="home" read={read} />
        </QueryProvider>,
      )
      await screen.findByText('home: 1')
      return { read, view }
    }

    it.each([
      ['signing in', () => useAuthStore.setState({ profile })],
      ['continuing as a guest', () => useAuthStore.setState({ guest: true })],
    ])('forgets everything on %s', async (_name, change) => {
      const { read, view } = await remembered()
      // Leave the page, change who is using the app, come back.
      view.rerender(<QueryProvider><p>elsewhere</p></QueryProvider>)
      act(() => void change())
      view.rerender(<QueryProvider><Page name="home" read={read} /></QueryProvider>)

      expect(screen.getByText('home: loading')).toBeInTheDocument()
      await screen.findByText('home: 1')
      expect(logs.lines.map((line) => line.message)).toContain('Signed in or out, forgetting what pages remembered')
    })

    it('forgets everything on signing out', async () => {
      useAuthStore.setState({ profile })
      const { read, view } = await remembered()
      view.rerender(<QueryProvider><p>elsewhere</p></QueryProvider>)
      act(() => void useAuthStore.setState({ profile: null }))
      view.rerender(<QueryProvider><Page name="home" read={read} /></QueryProvider>)
      expect(screen.getByText('home: loading')).toBeInTheDocument()
    })

    it('keeps what it remembered when the same account changes its name or picture', async () => {
      useAuthStore.setState({ profile })
      const { read, view } = await remembered()
      view.rerender(<QueryProvider><p>elsewhere</p></QueryProvider>)
      act(() => void useAuthStore.setState({ profile: { ...profile, name: 'Omkar S.' } }))
      view.rerender(<QueryProvider><Page name="home" read={read} /></QueryProvider>)
      expect(screen.getByText('home: 1')).toBeInTheDocument()
    })

    it('keeps what it remembered when something else in the session changes', async () => {
      const { read, view } = await remembered()
      view.rerender(<QueryProvider><p>elsewhere</p></QueryProvider>)
      // A token appearing is not a different person.
      act(() => void useAuthStore.setState({ driveToken: { value: 't', expiresAt: 1 } }))
      view.rerender(<QueryProvider><Page name="home" read={read} /></QueryProvider>)
      expect(screen.getByText('home: 1')).toBeInTheDocument()
    })
  })

  it('does not forget on every render: the cache lives as long as the provider', async () => {
    const { read } = setUp()
    const view = render(<QueryProvider><Page name="home" read={read} /></QueryProvider>)
    await screen.findByText('home: 1')
    view.rerender(<QueryProvider><Page name="home" read={read} /></QueryProvider>)
    await waitFor(() => expect(screen.getByText('home: 1')).toBeInTheDocument())
  })
})
