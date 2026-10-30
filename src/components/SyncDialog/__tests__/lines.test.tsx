// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupService } from '../../../services/backupService'
import { useSyncStore } from '../../../stores/useSyncStore'
import type { SyncStep } from '../../../stores/useSyncStore/types.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { renderPage } from '../../../testing/render.tsx'
import { SyncDialog } from '../index.tsx'

vi.mock('../../../db/client.ts', async (importOriginal) => {
  const { testDatabase } = await import('../../../testing/currentDatabase.ts')
  return {
    ...(await importOriginal<typeof import('../../../db/client.ts')>()),
    getDb: vi.fn(async () => testDatabase.current!),
  }
})

const testDb = setUpTestDatabase()

beforeEach(() =>
  useSyncStore.setState({ running: false, dialogOpen: false, title: '', steps: [], dataVersion: 0, stopRun: null, stopping: false, resume: null, newEvents: 0 }),
)
afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 30))
})

const line = (key: string, status: SyncStep['status'], detail = ''): SyncStep => ({ key, label: key, status, detail })

async function startRun(steps: SyncStep[]) {
  renderPage(<SyncDialog />)
  act(() => useSyncStore.getState().start('Syncing', steps, { kind: 'all' }))
  await screen.findByRole('dialog', { name: 'Syncing' })
}

const labels = () =>
  within(screen.getByRole('list', { name: 'Progress' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('strong')?.textContent)

describe('the icons of the lines', () => {
  it('turns the icon of a line that is working', async () => {
    await startRun([line('backup', 'running'), line('a', 'done')])

    const [working, finished] = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem')
    expect(working.querySelector('.tabler-icon-loader-2')).toHaveClass('icon-spin')
    expect(finished.querySelector('.tabler-icon-loader-2')).toBeNull()
    expect(finished.querySelector('.icon-spin')).toBeNull()
  })
})

describe('"Last synced" in the footer', () => {
  it('shows while a run goes on, as when the previous sync finished', async () => {
    await backupService.recordBackup(testDb.db, new Date(Date.now() - 5 * 60 * 1000))
    await startRun([line('backup', 'running')])

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/^Last synced/)).toBeInTheDocument())
    expect(screen.getByText(/^Last synced/)).toHaveTextContent(/5 min/)
  })

  it('says nothing before the first sync', async () => {
    await startRun([line('backup', 'running')])

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument())
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument()
  })
})

describe('the order of the lines', () => {
  it('moves the group that is working up under Backup, and keeps the order a run ends in', async () => {
    await startRun([line('backup', 'running'), line('a', 'running'), line('b', 'waiting'), line('c', 'waiting')])
    expect(labels()).toEqual(['backup', 'a', 'b', 'c'])

    act(() => useSyncStore.getState().updateStep('a', { status: 'done' }))
    act(() => useSyncStore.getState().updateStep('b', { status: 'running' }))
    expect(labels()).toEqual(['backup', 'b', 'a', 'c'])

    act(() => useSyncStore.getState().updateStep('b', { status: 'done' }))
    act(() => useSyncStore.getState().updateStep('c', { status: 'running' }))
    expect(labels()).toEqual(['backup', 'c', 'a', 'b'])

    act(() => useSyncStore.getState().updateStep('c', { status: 'done' }))
    act(() => useSyncStore.getState().finish())
    expect(labels()).toEqual(['backup', 'c', 'a', 'b'])
  })

  it('starts again from the lines\' own order when a new run begins, even with as many lines as before', async () => {
    await startRun([line('backup', 'running'), line('a', 'done'), line('b', 'running')])
    expect(labels()).toEqual(['backup', 'b', 'a'])
    act(() => useSyncStore.getState().finish())

    act(() => useSyncStore.getState().start('Syncing', [line('backup', 'running'), line('a', 'waiting'), line('b', 'waiting')], { kind: 'all' }))

    expect(labels()).toEqual(['backup', 'a', 'b'])
  })

  it('adds a line that comes later at the end', async () => {
    await startRun([line('backup', 'running'), line('a', 'running')])

    act(() => useSyncStore.getState().addStep(line('new', 'waiting')))

    expect(labels()).toEqual(['backup', 'a', 'new'])
  })
})
