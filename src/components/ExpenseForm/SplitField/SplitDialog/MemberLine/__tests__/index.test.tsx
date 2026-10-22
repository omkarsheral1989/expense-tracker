// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPage } from '../../../../../../testing/render.tsx'
import { MemberLine } from '../index.tsx'

afterEach(cleanup)

const priya = { personId: 'p1', email: 'priya@gmail.com', name: 'Priya Shah', isYou: false }

describe('MemberLine', () => {
  it('shows the member\'s Google picture before their name', () => {
    renderPage(
      <MemberLine member={{ ...priya, picture: 'https://example.com/priya.png' }}>
        <span>entry</span>
      </MemberLine>,
    )

    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/priya.png')
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
  })

  it('shows the first letter of the name when there is no picture, and "You" for the user', () => {
    const view = renderPage(
      <>
        <MemberLine member={priya}>
          <span>entry</span>
        </MemberLine>
        <MemberLine member={{ ...priya, personId: 'me', isYou: true }}>
          <span>entry</span>
        </MemberLine>
      </>,
    )

    expect(document.querySelector('img')).toBeNull()
    expect(within(view.container).getByText('P')).toBeInTheDocument()
    expect(within(view.container).getByText('Y')).toBeInTheDocument()
  })
})
