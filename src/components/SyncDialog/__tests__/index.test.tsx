// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncStore } from '../../../stores/useSyncStore'
import { renderPage } from '../../../testing/render.tsx'
import { SyncDialog } from '../index.tsx'

// The footer's "Last synced" reads the database; here it never answers.
vi.mock('../../../db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../db/client.ts')>()),
  getDb: vi.fn(() => new Promise(() => {})),
}))

beforeEach(() =>
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0, stopRun: null, stopping: false, resume: null }),
)
afterEach(cleanup)

const steps = [{ key: 'backup', label: 'Backup', status: 'running' as const, detail: 'Getting your backup…' }]

async function startRun(cancel = vi.fn()) {
  renderPage(<SyncDialog />)
  act(() => {
    useSyncStore.getState().start('Syncing', steps, { kind: 'all' })
    useSyncStore.getState().setStopRun(cancel)
  })
  await screen.findByRole('dialog', { name: 'Syncing' })
  return cancel
}

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
