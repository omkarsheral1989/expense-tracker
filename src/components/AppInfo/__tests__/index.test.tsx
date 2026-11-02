// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { AppInfo } from '../index.tsx'

afterEach(cleanup)

describe('AppInfo', () => {
  it('tells what the app is: the name, tagline, features, privacy, how it works, questions and footer', () => {
    renderPage(<AppInfo />)

    expect(screen.getByRole('heading', { level: 1, name: 'OwnLedger' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Split expenses with friends. Keep your data.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Everything you need to share costs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument()
    expect(screen.getByText(/OwnLedger is free and open source \(GPL-3\.0\)/)).toBeInTheDocument()
  })

  it('shows a version only when it is given one', () => {
    const { rerender } = renderPage(<AppInfo />)
    expect(screen.queryByText(/^Version/)).not.toBeInTheDocument()
    rerender(<AppInfo version="2.3.4" />)

    expect(screen.getByText('Version 2.3.4')).toBeInTheDocument()
  })

  it('puts what it is given under the highlight lines, inside the hero', () => {
    renderPage(
      <AppInfo>
        <button type="button">Start</button>
      </AppInfo>,
    )

    const highlight = screen.getByText('Free and open source.')
    const start = screen.getByRole('button', { name: 'Start' })
    expect(highlight.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(start.closest('header')).not.toBeNull()
  })
})
