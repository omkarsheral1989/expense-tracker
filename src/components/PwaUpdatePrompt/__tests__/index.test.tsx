// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdatePrompt } from '../index.tsx'

// What the PWA plugin's hook says right now; each test sets it.
const pwa = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, () => {}],
    offlineReady: [pwa.offlineReady, () => {}],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}))

function renderPrompt() {
  return render(
    <ConfigProvider theme={{ zeroRuntime: true, token: { motion: false } }}>
      <App>
        <PwaUpdatePrompt />
      </App>
    </ConfigProvider>,
  )
}

afterEach(() => {
  cleanup()
  pwa.needRefresh = false
  pwa.offlineReady = false
  pwa.updateServiceWorker.mockReset()
})

describe('PwaUpdatePrompt', () => {
  it('says nothing while there is nothing to say', () => {
    renderPrompt()
    expect(screen.queryByText('New version available')).not.toBeInTheDocument()
    expect(screen.queryByText('OwnLedger is ready to work offline.')).not.toBeInTheDocument()
  })

  it('tells the user the app is ready to work offline', async () => {
    pwa.offlineReady = true
    renderPrompt()
    expect(await screen.findByText('OwnLedger is ready to work offline.')).toBeInTheDocument()
  })

  it('announces a new version and lets the user decide when to load it', async () => {
    pwa.needRefresh = true
    renderPrompt()

    expect(await screen.findByText('New version available')).toBeInTheDocument()
    expect(screen.getByText('Reload to get the latest OwnLedger.')).toBeInTheDocument()
    // Nothing is replaced until the button is pressed.
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true)
  })
})
