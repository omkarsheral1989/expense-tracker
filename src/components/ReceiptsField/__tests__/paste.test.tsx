// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPage } from '../../../testing/render.tsx'
import { ReceiptsField } from '../index.tsx'

afterEach(cleanup)

const picture = (name: string) => new File([`picture ${name}`], name, { type: 'image/png' })

/** A paste event with the given files and text on its clipboard, sent to `target`; returns whether the page let it go on (not prevented). */
function paste(target: Element, files: File[], text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
  return fireEvent(target, event)
}

function Harness() {
  const [files, setFiles] = useState<File[]>([])
  return <ReceiptsField value={files} onChange={setFiles} />
}

describe('pasting a picture into ReceiptsField (PRD 5.5)', () => {
  it('attaches a pasted picture after the photos already chosen', () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField value={[picture('a.png')]} onChange={onChange} />)

    paste(document.body, [picture('b.png')])

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' }), expect.objectContaining({ name: 'b.png' })])
  })

  it('attaches several pasted pictures and ignores files that are not pictures', () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField onChange={onChange} />)

    paste(document.body, [picture('a.png'), new File(['x'], 'notes.txt', { type: 'text/plain' }), picture('b.png')])

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' }), expect.objectContaining({ name: 'b.png' })])
  })

  it('attaches the picture while a text field is focused when the clipboard holds no text', () => {
    const onChange = vi.fn()
    renderPage(
      <>
        <input aria-label="Description" />
        <ReceiptsField onChange={onChange} />
      </>,
    )

    const proceeded = paste(screen.getByLabelText('Description'), [picture('a.png')])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(proceeded).toBe(false)
  })

  it('leaves a paste with text into a text field alone', () => {
    const onChange = vi.fn()
    renderPage(
      <>
        <input aria-label="Description" />
        <textarea aria-label="Notes" />
        <ReceiptsField onChange={onChange} />
      </>,
    )

    expect(paste(screen.getByLabelText('Description'), [picture('a.png')], 'lunch')).toBe(true)
    expect(paste(screen.getByLabelText('Notes'), [picture('a.png')], 'lunch')).toBe(true)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('attaches the picture when text comes with it but nothing is focused (a copied file keeps its name as text)', () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField onChange={onChange} />)

    paste(document.body, [picture('a.png')], 'a.png')

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores a paste with no pictures, and does not stop it', () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField onChange={onChange} />)

    expect(paste(document.body, [], 'just text')).toBe(true)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the first 10 photos and says so when a paste goes over', async () => {
    const onChange = vi.fn()
    const nine = Array.from({ length: 9 }, (_, index) => picture(`${index}.png`))
    renderPage(<ReceiptsField value={nine} onChange={onChange} />)

    paste(document.body, [picture('x.png'), picture('y.png')])

    expect(onChange).toHaveBeenCalledWith([...nine, expect.objectContaining({ name: 'x.png' })])
    expect(await screen.findByText('An expense can have up to 10 photos.')).toBeInTheDocument()
  })

  it('attaches nothing at 10 photos', async () => {
    const onChange = vi.fn()
    renderPage(<ReceiptsField value={Array.from({ length: 10 }, (_, index) => picture(`${index}.png`))} onChange={onChange} />)

    paste(document.body, [picture('x.png')])

    expect(onChange).not.toHaveBeenCalled()
    expect(await screen.findByText('An expense can have up to 10 photos.')).toBeInTheDocument()
  })

  it('stops listening when the field is gone', () => {
    const onChange = vi.fn()
    const { unmount } = renderPage(<ReceiptsField onChange={onChange} />)
    unmount()

    paste(document.body, [picture('a.png')])

    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds each paste to what the earlier ones attached', async () => {
    renderPage(<Harness />)

    paste(document.body, [picture('a.png')])
    await screen.findByRole('img', { name: 'Receipt photo 1' })
    paste(document.body, [picture('b.png')])

    expect(await screen.findByRole('img', { name: 'Receipt photo 2' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Receipt photo 1' })).toBeInTheDocument()
  })

  it('does not stop the paste of a file that is not a picture', () => {
    renderPage(<ReceiptsField onChange={vi.fn()} />)

    expect(paste(document.body, [new File(['x'], 'notes.txt', { type: 'text/plain' })])).toBe(true)
  })

  it('leaves text pasted into an editable element alone', () => {
    const onChange = vi.fn()
    renderPage(
      <>
        <div data-testid="editor" />
        <ReceiptsField onChange={onChange} />
      </>,
    )
    const editor = screen.getByTestId('editor')
    // jsdom does not know contenteditable, so the property is set by hand.
    Object.defineProperty(editor, 'isContentEditable', { value: true })

    expect(paste(editor, [picture('a.png')], 'lunch')).toBe(true)

    expect(onChange).not.toHaveBeenCalled()
  })
})
