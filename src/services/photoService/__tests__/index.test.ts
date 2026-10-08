import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { photoService } from '../index.ts'
import type { PhotoStore } from '../types.ts'

/** A store for a new, unique account, so tests do not share photos. */
function newStore() {
  return photoService.open(crypto.randomUUID())
}

async function text(blob: Blob | null) {
  return blob ? blob.text() : null
}

describe('photoService.open', () => {
  it('keeps a photo and its thumbnail under an id, with their types', async () => {
    const store = newStore()
    await store.savePhoto('p1', new Blob(['original'], { type: 'image/png' }), new Blob(['thumb'], { type: 'image/jpeg' }))

    const photo = await store.getPhoto('p1')
    expect(await text(photo)).toBe('original')
    expect(photo?.type).toBe('image/png')
    const thumbnail = await store.getThumbnail('p1')
    expect(await text(thumbnail)).toBe('thumb')
    expect(thumbnail?.type).toBe('image/jpeg')
  })

  it('gives null for a photo it does not have', async () => {
    const store = newStore()
    expect(await store.getPhoto('missing')).toBeNull()
    expect(await store.getThumbnail('missing')).toBeNull()
  })

  it('removes both the photo and its thumbnail, and accepts removing nothing', async () => {
    const store = newStore()
    await store.savePhoto('p1', new Blob(['a']), new Blob(['b']))
    await store.deletePhoto('p1')
    await store.deletePhoto('never-there')

    expect(await store.getPhoto('p1')).toBeNull()
    expect(await store.getThumbnail('p1')).toBeNull()
  })

  it('keeps each account\'s photos apart', async () => {
    const mine = photoService.open('account-a')
    const theirs = photoService.open('account-b')
    await mine.savePhoto('p1', new Blob(['mine']), new Blob(['t']))

    expect(await theirs.getPhoto('p1')).toBeNull()
    expect(await text(await photoService.open('account-a').getPhoto('p1'))).toBe('mine')
  })
})

describe('photoService.makeThumbnail', () => {
  it('uses the photo itself when the picture cannot be read', async () => {
    // Node has no image decoding, as a browser has none for some formats.
    const photo = new Blob(['not really a picture'], { type: 'image/heic' })
    expect(await photoService.makeThumbnail(photo)).toBe(photo)
  })
})

describe('storeReceipts and removeReceipts', () => {
  it('keeps each file under a new id and describes it, in order', async () => {
    const store = newStore()
    const files = [
      new File(['first'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['second!'], 'b.png', { type: 'image/png' }),
    ]

    const receipts = await photoService.storeReceipts(store, files)

    expect(receipts.map(({ mimeType, sizeBytes }) => ({ mimeType, sizeBytes }))).toEqual([
      { mimeType: 'image/jpeg', sizeBytes: 5 },
      { mimeType: 'image/png', sizeBytes: 7 },
    ])
    expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(2)
    expect(await text(await store.getPhoto(receipts[1].id))).toBe('second!')

    await photoService.removeReceipts(store, receipts.map((receipt) => receipt.id))
    expect(await store.getPhoto(receipts[0].id)).toBeNull()
  })
})

describe('storeReceipts when the device cannot keep a photo', () => {
  it('removes the photos it already kept and passes the error on', async () => {
    const store = newStore()
    const kept: string[] = []
    let saves = 0
    const failingSecond: PhotoStore = {
      ...store,
      async savePhoto(id, photo, thumbnail) {
        if (++saves === 2) throw new Error('QuotaExceededError')
        kept.push(id)
        await store.savePhoto(id, photo, thumbnail)
      },
    }
    const files = ['a', 'b', 'c'].map((name) => new File([name], `${name}.jpg`, { type: 'image/jpeg' }))

    await expect(photoService.storeReceipts(failingSecond, files)).rejects.toThrow('QuotaExceededError')

    expect(kept).toHaveLength(1)
    expect(await store.getPhoto(kept[0])).toBeNull()
  })
})
