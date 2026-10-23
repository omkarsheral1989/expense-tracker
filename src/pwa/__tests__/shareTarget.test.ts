import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { receiveShare, notesFrom } from '../shareTarget.ts'
import { sharedFiles } from '../sharedFiles.ts'

const LANDING = 'https://example.test/ownledger/share'
const NOW = 5_000

function picture(name: string, type = 'image/png', bytes = [1, 2, 3]) {
  return new File([new Uint8Array(bytes)], name, { type })
}

/** The request the share sheet sends: a multipart POST with the manifest's field names. */
function shareRequest(fields: { files?: File[]; title?: string; text?: string; url?: string }) {
  const form = new FormData()
  for (const file of fields.files ?? []) form.append('receipts', file)
  if (fields.title !== undefined) form.append('title', fields.title)
  if (fields.text !== undefined) form.append('text', fields.text)
  if (fields.url !== undefined) form.append('url', fields.url)
  return new Request('https://example.test/ownledger/share-target', { method: 'POST', body: form })
}

describe('notesFrom', () => {
  it('puts the title, text and link on one line each, in that order', () => {
    expect(notesFrom({ title: 'Dinner', text: 'Beach shack', url: 'https://x.test/a' })).toBe(
      'Dinner\nBeach shack\nhttps://x.test/a',
    )
  })

  it('leaves out empty parts and repeats, and trims', () => {
    expect(notesFrom({ title: '  Dinner ', text: 'Dinner', url: '' })).toBe('Dinner')
    expect(notesFrom({})).toBe('')
  })

  it('cuts at the notes limit of 1000 characters', () => {
    expect(notesFrom({ text: 'x'.repeat(1500) })).toHaveLength(1000)
  })
})

describe('receiveShare', () => {
  beforeEach(async () => {
    await sharedFiles.clear()
  })

  it('keeps the pictures and the text, and sends the browser to the landing page with a 303', async () => {
    const response = await receiveShare(
      shareRequest({ files: [picture('a.png'), picture('b.jpg', 'image/jpeg', [9])], title: 'Dinner', text: 'Beach shack' }),
      LANDING,
      NOW,
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(LANDING)
    const held = await sharedFiles.read(NOW)
    expect(held?.pictures.map((p) => [p.name, p.type])).toEqual([
      ['a.png', 'image/png'],
      ['b.jpg', 'image/jpeg'],
    ])
    expect([...new Uint8Array(held!.pictures[1].bytes)]).toEqual([9])
    expect(held?.notes).toBe('Dinner\nBeach shack')
    expect(held?.leftOut).toBe(0)
    expect(held?.sharedAt).toBe(NOW)
  })

  it('ignores files that are not pictures', async () => {
    await receiveShare(shareRequest({ files: [picture('a.pdf', 'application/pdf'), picture('a.png')] }), LANDING, NOW)
    expect((await sharedFiles.read(NOW))?.pictures.map((p) => p.name)).toEqual(['a.png'])
  })

  it('keeps the first 10 pictures and counts the ones left out', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => picture(`p${i}.png`))
    await receiveShare(shareRequest({ files: twelve }), LANDING, NOW)
    const held = await sharedFiles.read(NOW)
    expect(held?.pictures).toHaveLength(10)
    expect(held?.pictures[9].name).toBe('p9.png')
    expect(held?.leftOut).toBe(2)
  })

  it('keeps a text-only share', async () => {
    await receiveShare(shareRequest({ text: 'hello' }), LANDING, NOW)
    const held = await sharedFiles.read(NOW)
    expect(held?.pictures).toHaveLength(0)
    expect(held?.notes).toBe('hello')
  })

  it('keeps nothing when nothing usable was shared, and drops an earlier held share', async () => {
    await receiveShare(shareRequest({ text: 'earlier' }), LANDING, NOW)
    const response = await receiveShare(shareRequest({ files: [picture('a.pdf', 'application/pdf')] }), LANDING, NOW)

    expect(response.status).toBe(303)
    expect(await sharedFiles.read(NOW)).toBeNull()
  })

  it('replaces an earlier held share with the new one', async () => {
    await receiveShare(shareRequest({ text: 'first' }), LANDING, NOW)
    await receiveShare(shareRequest({ text: 'second' }), LANDING, NOW)
    expect((await sharedFiles.read(NOW))?.notes).toBe('second')
  })

  it('still redirects when the request cannot be read', async () => {
    const broken = new Request('https://example.test/ownledger/share-target', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: 'not a form',
    })
    const response = await receiveShare(broken, LANDING, NOW)

    expect(response.status).toBe(303)
    expect(await sharedFiles.read(NOW)).toBeNull()
  })
})
