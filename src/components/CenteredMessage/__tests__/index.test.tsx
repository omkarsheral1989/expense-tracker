// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CenteredMessage } from '../index.tsx'

afterEach(cleanup)

describe('CenteredMessage', () => {
  it('centers its content vertically and horizontally and fills the rest of the page', () => {
    render(
      <CenteredMessage>
        <p>Nothing here</p>
      </CenteredMessage>,
    )

    const box = screen.getByText('Nothing here').parentElement as HTMLElement
    expect(box).toHaveClass('ant-flex-vertical', 'ant-flex-align-center', 'ant-flex-justify-center')
    expect(box).toHaveStyle({ flex: '1', width: '100%', maxWidth: '720px', paddingBottom: '0px' })
  })

  it('keeps room free below the message when something floats over the bottom of the screen', () => {
    render(
      <CenteredMessage roomBelow={88}>
        <p>Nothing here</p>
      </CenteredMessage>,
    )

    expect(screen.getByText('Nothing here').parentElement).toHaveStyle({ paddingBottom: '88px' })
  })
})
