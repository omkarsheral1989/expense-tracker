// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { slide } from '../../../hooks/useAppNavigate/utils.ts'
import { handleOverlayPop, openOverlayCount } from '../../../hooks/useCloseOnBack/overlays.ts'
import { renderPage } from '../../../testing/render.tsx'
import { AdaptiveDialog } from '../index.tsx'

const originalMatchMedia = window.matchMedia

/** Pretends the screen is wide (desktop) or narrow (phone) for Ant Design's breakpoints. */
function setScreenWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => setScreenWide(false))
afterEach(async () => {
  cleanup()
  window.matchMedia = originalMatchMedia
  // A closed dialog takes its history step away a moment later; that is over before the next test starts.
  await new Promise((resolve) => setTimeout(resolve, 30))
})

const bottom = 'env(safe-area-inset-bottom)'

function renderDialog(footer?: React.ReactNode) {
  return renderPage(
    <AdaptiveDialog open onClose={() => {}} title="A sheet" footer={footer}>
      <p>Content</p>
    </AdaptiveDialog>,
  )
}

describe('AdaptiveDialog on a phone', () => {
  it('keeps its footer clear of the screen\'s rounded corners and home indicator', async () => {
    renderDialog(<button>Save</button>)

    await screen.findByRole('dialog', { name: 'A sheet' })
    const footer = document.querySelector<HTMLElement>('.ant-drawer-footer')!
    expect(footer.getAttribute('style')).toContain(bottom)
  })

  it('does the same for the end of the content when there is no footer', async () => {
    renderDialog()

    await screen.findByRole('dialog', { name: 'A sheet' })
    const body = document.querySelector<HTMLElement>('.ant-drawer-body')!
    expect(body.getAttribute('style')).toContain(bottom)
    expect(document.querySelector('.ant-drawer-footer')).toBeNull()
  })

  it('leaves the body alone when there is a footer, since the footer ends the sheet', async () => {
    renderDialog(<button>Save</button>)

    await screen.findByRole('dialog', { name: 'A sheet' })
    expect(document.querySelector('.ant-drawer-body')?.getAttribute('style') ?? '').not.toContain(bottom)
  })
})

describe('AdaptiveDialog on a wide screen', () => {
  it('is a centered dialog with no padding for a screen edge', async () => {
    setScreenWide(true)
    renderDialog(<button>Save</button>)

    await screen.findByRole('dialog', { name: 'A sheet' })
    expect(document.querySelector('.ant-modal')).not.toBeNull()
    expect(document.querySelector('.ant-drawer')).toBeNull()
    expect(document.body.innerHTML).not.toContain(bottom)
  })
})

describe.each([
  ['a phone', false],
  ['a wide screen', true],
])('a dialog that must stay, on %s', (_name, wide) => {
  beforeEach(() => setScreenWide(wide))

  function renderStaying(dismissible: boolean) {
    const onClose = vi.fn()
    renderPage(
      <AdaptiveDialog open onClose={onClose} title="Syncing" dismissible={dismissible}>
        <p>Content</p>
      </AdaptiveDialog>,
    )
    return onClose
  }

  it('has no close button, and ignores a click outside and Escape', async () => {
    const onClose = renderStaying(false)
    await screen.findByRole('dialog', { name: 'Syncing' })

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    const mask = document.querySelector<HTMLElement>('.ant-drawer-mask, .ant-modal-wrap')!
    await userEvent.click(mask)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape', keyCode: 27 })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with its close button, a click outside and Escape by default', async () => {
    const onClose = renderStaying(true)
    await screen.findByRole('dialog', { name: 'Syncing' })

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(document.querySelector<HTMLElement>('.ant-drawer-mask, .ant-modal-wrap')!)
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape', keyCode: 27 })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe.each([
  ['a phone', false],
  ['a wide screen', true],
])('the browser\'s Back button on %s (PRD 5.19)', (_name, wide) => {
  beforeEach(() => {
    setScreenWide(wide)
    window.history.replaceState({ usr: null, key: 'page', idx: 0 }, '', '/')
    slide.key = 'page'
    window.addEventListener('popstate', handleOverlayPop)
  })
  afterEach(async () => {
    cleanup()
    await tick()
    window.removeEventListener('popstate', handleOverlayPop)
  })

  const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
  const state = () => window.history.state as { overlay?: number } | null

  async function back() {
    window.history.back()
    // The overlay handler holds the popstate back from other listeners, so wait on time.
    await new Promise((resolve) => setTimeout(resolve, 30))
  }

  /** The dialog opens and closes from the page, as the pickers do. */
  function Harness({ dismissible = true, onClosed }: { dismissible?: boolean; onClosed?: () => void }) {
    const [open, setOpen] = useState(true)
    return (
      <>
        <AdaptiveDialog open={open} onClose={() => (setOpen(false), onClosed?.())} title="A sheet" dismissible={dismissible}>
          <p>Content</p>
        </AdaptiveDialog>
        <button onClick={() => setOpen(true)}>Reopen</button>
      </>
    )
  }

  it('holds a step of the history while it is open, and Back closes it', async () => {
    const onClosed = vi.fn()
    renderPage(<Harness onClosed={onClosed} />)
    await screen.findByRole('dialog', { name: 'A sheet' })
    expect(state()?.overlay).toBe(1)

    await act(async () => back())

    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'A sheet' })).not.toBeInTheDocument()
    expect(state()?.overlay).toBeUndefined()
  })

  it('takes its step away again when it is closed with its own button, so Back still leaves the page', async () => {
    renderPage(<Harness />)
    await screen.findByRole('dialog', { name: 'A sheet' })

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => {
      await tick()
      await tick()
    })

    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })

  it('stays when it must (the sync progress): Back does nothing and the step is kept', async () => {
    const onClosed = vi.fn()
    renderPage(<Harness dismissible={false} onClosed={onClosed} />)
    await screen.findByRole('dialog', { name: 'A sheet' })

    await act(async () => back())

    expect(onClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'A sheet' })).toBeInTheDocument()
    expect(state()?.overlay).toBe(1)
  })

  it('holds a step only while it is open', async () => {
    renderPage(<AdaptiveDialog open={false} onClose={() => {}} title="A sheet"><p>Content</p></AdaptiveDialog>)
    await act(async () => tick())

    expect(state()?.overlay).toBeUndefined()
    expect(openOverlayCount()).toBe(0)
  })
})
