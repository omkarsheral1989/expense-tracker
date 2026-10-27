// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncStore } from '../../../stores/useSyncStore'
import { ROUTES } from '../../../routes.ts'
import { renderPage } from '../../../testing/render.tsx'
import { SyncDialog } from '../index.tsx'

// The footer's "Last synced" reads the database; here it never answers.
vi.mock('../../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../db/client.ts')>()),
  getDb: vi.fn(() => new Promise(() => {})),
}))

beforeEach(() =>
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0, stopRun: null, stopping: false, resume: null, newEvents: 0 }),
)
afterEach(cleanup)

const steps = [{ key: 'backup', label: 'Backup', status: 'running' as const, detail: 'Getting your backup…' }]

async function startRun(cancel = vi.fn()) {
  const page = renderPage(<SyncDialog />, { routes: [ROUTES.activity] })
  act(() => {
    useSyncStore.getState().start('Syncing', steps, { kind: 'all' })
    useSyncStore.getState().setStopRun(cancel)
  })
  await screen.findByRole('dialog', { name: 'Syncing' })
  startedPage = page
  return cancel
}

let startedPage: ReturnType<typeof renderPage>

describe('the sync dialog while a run goes on', () => {
  it('has Stop and no Close, so the app behind cannot be used', async () => {
    await startRun()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('stays open when clicked outside or Escape is pressed', async () => {
    await startRun()
    await userEvent.click(document.querySelector<HTMLElement>('.ant-drawer-mask, .ant-modal-wrap')!)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape', keyCode: 27 })

    expect(screen.getByRole('dialog', { name: 'Syncing' })).toBeInTheDocument()
    expect(useSyncStore.getState().dialogOpen).toBe(true)
  })

  it('cancels the run when Stop is pressed, and shows that it is stopping', async () => {
    const cancel = await startRun()
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
  })
})

describe('the sync dialog once the run has ended', () => {
  it('has Close and no Stop, and closes', async () => {
    await startRun()
    act(() => useSyncStore.getState().finish())

    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(useSyncStore.getState().dialogOpen).toBe(false)
  })
})

describe('the sync dialog after a sync that brought in changes by other members (PRD 5.18)', () => {
  async function endRun(newEvents: number) {
    await startRun()
    act(() => {
      useSyncStore.getState().setNewEvents(newEvents)
      useSyncStore.getState().finish()
    })
  }

  it('says how many changes came in, with a way to open Activity', async () => {
    await endRun(3)

    expect(screen.getByText('3 new changes in your groups')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Activity' })).toBeInTheDocument()
  })

  it('says "1 new change" for one', async () => {
    await endRun(1)

    expect(screen.getByText('1 new change in your groups')).toBeInTheDocument()
  })

  it('says nothing when nobody else changed anything, or while the run goes on', async () => {
    await endRun(0)
    expect(screen.queryByText(/new change/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Activity' })).not.toBeInTheDocument()

    cleanup()
    await startRun()
    act(() => useSyncStore.getState().setNewEvents(2))
    expect(screen.queryByText(/new change/)).not.toBeInTheDocument()
  })

  it('opens Activity from the line, closes the dialog, and leaves no message behind', async () => {
    await endRun(3)

    await userEvent.click(screen.getByRole('button', { name: 'Open Activity' }))

    expect(startedPage.currentPath()).toBe(ROUTES.activity)
    expect(useSyncStore.getState().dialogOpen).toBe(false)
    expect(screen.queryByText('3 new changes in your groups', { selector: '.ant-message *' })).not.toBeInTheDocument()
  })

  it('leaves a message with Open when the dialog is closed, which opens Activity and goes', async () => {
    await endRun(2)

    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)

    const message = await screen.findByText('2 new changes in your groups', { selector: '.ant-message *' })
    expect(message.closest('.ant-message-notice')).toBeInTheDocument()
    await userEvent.click(within(message.closest('.ant-message-notice') as HTMLElement).getByRole('button', { name: 'Open' }))
    expect(startedPage.currentPath()).toBe(ROUTES.activity)
    await waitFor(() => expect(screen.queryByText('2 new changes in your groups', { selector: '.ant-message *' })).not.toBeInTheDocument())
  })

  it('leaves no message when the dialog is closed after a sync with nothing new', async () => {
    await endRun(0)

    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)

    expect(document.querySelector('.ant-message-notice')).toBeNull()
  })
})
