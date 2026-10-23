import { describe, expect, it } from 'vitest'
import { cleanFields, cleanText, errorFields, idFields, outcomeFields } from '../utils.ts'

describe('cleanText', () => {
  it('hides emails and Google tokens inside text', () => {
    expect(cleanText('Shared with priya@gmail.com today')).toBe('Shared with [email] today')
    expect(cleanText('Bearer ya29.a0AfH6SMB_x-y')).toBe('[token]')
    expect(cleanText('token ya29.abc123 sent')).toBe('token [token] sent')
  })

  it('cuts long text at 200 characters', () => {
    const cut = cleanText('x'.repeat(500))
    expect(cut).toBe(`${'x'.repeat(200)}…`)
  })

  it('leaves ordinary text alone', () => {
    expect(cleanText('403: Rate limit exceeded')).toBe('403: Rate limit exceeded')
  })
})

describe('cleanFields', () => {
  it('keeps numbers, booleans, null and short text', () => {
    expect(cleanFields({ count: 3, ok: true, parent: null, kind: 'backup' })).toEqual({
      count: 3,
      ok: true,
      parent: null,
      kind: 'backup',
    })
  })

  it.each([
    'email',
    'userEmail',
    'name',
    'groupName',
    'notes',
    'description',
    'picture',
    'text',
    'title',
    'url',
    'address',
  ])('drops text under the personal field name %s', (key) => {
    expect(cleanFields({ [key]: 'value', keep: 1 })).toEqual({ keep: 1 })
  })

  it.each(['amount', 'amountMinor', 'cost', 'price', 'accessToken', 'password', 'secret'])(
    'drops anything under the money or secret field name %s',
    (key) => {
      expect(cleanFields({ [key]: 'value', keep: 1 })).toEqual({ keep: 1 })
      expect(cleanFields({ [key]: 1250, keep: 1 })).toEqual({ keep: 1 })
    },
  )

  it('keeps a count or a flag under a name that could hold personal text', () => {
    expect(cleanFields({ pictures: 2, notesAdded: true, names: 3 })).toEqual({
      pictures: 2,
      notesAdded: true,
      names: 3,
    })
  })

  it('drops undefined values', () => {
    expect(cleanFields({ a: undefined, b: 2 })).toEqual({ b: 2 })
  })

  it('reduces objects and lists to their type or size, so nothing nested leaks', () => {
    expect(cleanFields({ rows: [1, 2, 3], payload: { secretStuff: 1 } })).toEqual({
      rows: 'array(3)',
      payload: 'object',
    })
  })

  it('cleans text values too', () => {
    expect(cleanFields({ reason: 'No access for a@gmail.com' })).toEqual({
      reason: 'No access for [email]',
    })
  })

  it('returns nothing without fields', () => {
    expect(cleanFields(undefined)).toEqual({})
  })
})

describe('errorFields', () => {
  it('names the error, its message and a numeric status', () => {
    const error = Object.assign(new Error('Quota'), { name: 'DriveError', status: 403 })
    expect(errorFields(error)).toEqual({ error: 'DriveError', reason: 'Quota', status: 403 })
  })

  it('leaves out a status that is not a number', () => {
    const error = Object.assign(new Error('x'), { status: 'bad' })
    expect(errorFields(error)).toEqual({ error: 'Error', reason: 'x' })
  })

  it('describes anything that is not an Error', () => {
    expect(errorFields('boom')).toEqual({ error: 'string', reason: 'boom' })
  })
})

describe('idFields', () => {
  const ID = '3f2a6c1e-8b7d-4e5f-9a10-b2c3d4e5f607'

  it('names the id arguments after the first and skips anything else', () => {
    expect(idFields([{}, ID, 'free text', ID], ['userId', 'note', 'groupId'])).toEqual({
      userId: ID,
      groupId: ID,
    })
  })

  it('returns nothing without names', () => {
    expect(idFields([{}, ID])).toEqual({})
  })
})

describe('outcomeFields', () => {
  it('treats a result without ok, or ok: true, as done', () => {
    expect(outcomeFields(undefined)).toEqual({ ok: true })
    expect(outcomeFields({ id: 1 })).toEqual({ ok: true })
    expect(outcomeFields({ ok: true })).toEqual({ ok: true })
  })

  it('lists the flags that refused and counts field errors', () => {
    expect(outcomeFields({ ok: false, notFound: true, alreadyCurrent: true })).toEqual({
      ok: false,
      refusal: 'notFound,alreadyCurrent',
    })
    expect(outcomeFields({ ok: false, errors: { a: 'x', b: 'y' } })).toEqual({ ok: false, fieldErrors: 2 })
  })
})
