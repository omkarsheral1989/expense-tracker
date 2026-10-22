// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
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
