// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { dialogLayer } from '../index.ts'

afterEach(() => {
  document.querySelectorAll('[data-dialog-layer]').forEach((element) => element.remove())
})

describe('dialogLayer', () => {
  it('is one marked element on the page', () => {
    const layer = dialogLayer()

    expect(layer.parentElement).toBe(document.body)
    expect(layer).toHaveAttribute('data-dialog-layer')
    expect(document.querySelectorAll('[data-dialog-layer]')).toHaveLength(1)
  })

  it('stays the same element for every dialog, so it never leaves the page during a transition', () => {
    const first = dialogLayer()
    first.appendChild(document.createElement('div'))
    first.replaceChildren()

    expect(dialogLayer()).toBe(first)
    expect(first.isConnected).toBe(true)
    expect(document.querySelectorAll('[data-dialog-layer]')).toHaveLength(1)
  })

  it('is made again when something took it off the page', () => {
    const first = dialogLayer()
    first.remove()

    const again = dialogLayer()

    expect(again).not.toBe(first)
    expect(again.isConnected).toBe(true)
    expect(document.querySelectorAll('[data-dialog-layer]')).toHaveLength(1)
  })
})
