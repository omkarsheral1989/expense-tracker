// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slide } from '../../useAppNavigate/utils.ts'
import { handleOverlayPop, openOverlayCount } from '../../useCloseOnBack/overlays.ts'
import { renderPage } from '../../../testing/render.tsx'
import { useConfirm } from '../index.ts'

// A confirmation is closed by the browser's Back button as Cancel closes it (PRD 5.19).

const tick = () => new Promise((resolve) => setTimeout(resolve, 30))
const state = () => window.history.state as { overlay?: number } | null

async function back() {
  window.history.back()
  // jsdom moves the history a moment later; the overlay handler holds the event back from other listeners, so wait on time.
  await new Promise((resolve) => setTimeout(resolve, 30))
}

beforeEach(async () => {
  await tick()
  window.history.replaceState({ usr: null, key: 'page', idx: 0 }, '', '/')
  slide.key = 'page'
  window.addEventListener('popstate', handleOverlayPop)
})
afterEach(async () => {
  cleanup()
  await tick()
  window.removeEventListener('popstate', handleOverlayPop)
})

function Page({ title, onOk, onCancel }: { title: string; onOk: () => void; onCancel: () => void }) {
  const confirm = useConfirm()
  return (
    <button onClick={() => confirm({ title, okText: 'Discard', cancelText: 'Keep editing', onOk, onCancel })}>Ask</button>
  )
}

/** The titles of the confirmations that are on the page (Ant Design draws a confirmation's title more than once, so the text alone is not unique). */
const titles = () => [...document.querySelectorAll('.ant-modal-confirm-title')].map((element) => element.textContent)
const shown = (title: string) => waitFor(() => expect(titles()).toContain(title))
const gone = (title: string) => waitFor(() => expect(titles()).not.toContain(title))

// Each test has a title of its own, since a confirmation lives outside the rendered tree and may outlast its test.
let count = 0

async function ask(onOk = vi.fn(), onCancel = vi.fn()) {
  const title = `Discard this ${++count}?`
  renderPage(<Page title={title} onOk={onOk} onCancel={onCancel} />)
  await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
  await shown(title)
  return { onOk, onCancel, title }
}

describe('useConfirm', () => {
  it('opens a confirmation that holds a step of the history', async () => {
    await ask()

    expect(state()?.overlay).toBe(1)
    expect(openOverlayCount()).toBe(1)
  })

  it('is closed by Back as the Cancel button closes it: onCancel is called, onOk is not, and the page stays', async () => {
    const { onOk, onCancel, title } = await ask()

    await act(async () => back())

    await gone(title)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOk).not.toHaveBeenCalled()
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('takes its step away again when Cancel is pressed, so Back still leaves the page', async () => {
    const { onCancel, title } = await ask()

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await gone(title)
    await act(async () => {
      await tick()
      await tick()
    })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('takes its step away again after OK when nothing changes the page', async () => {
    const { onOk, title } = await ask()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await gone(title)
    await act(async () => {
      await tick()
      await tick()
    })

    expect(onOk).toHaveBeenCalledTimes(1)
    expect(state()?.overlay).toBeUndefined()
  })

  it('works without an onCancel', async () => {
    function Bare() {
      const confirm = useConfirm()
      return <button onClick={() => confirm({ title: 'Sure without cancel?' })}>Ask</button>
    }
    renderPage(<Bare />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await shown('Sure without cancel?')

    await act(async () => back())

    await gone('Sure without cancel?')
  })

  it('also runs an afterClose it was given', async () => {
    const afterClose = vi.fn()
    function Page2() {
      const confirm = useConfirm()
      return <button onClick={() => confirm({ title: 'Sure with afterClose?', afterClose })}>Ask</button>
    }
    renderPage(<Page2 />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await shown('Sure with afterClose?')

    await act(async () => back())

    await waitFor(() => expect(afterClose).toHaveBeenCalledTimes(1))
  })
})
