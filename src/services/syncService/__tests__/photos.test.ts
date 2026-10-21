import 'fake-indexeddb/auto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expensePhotos } from '../../../db/schema.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createFakeDrive } from '../../../testing/fakeDrive.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { DriveAuthError, DriveError } from '../../driveService'
import { expenseService } from '../../expenseService'
import { photoService } from '../../photoService'
import type { PhotoStore } from '../../photoService/types.ts'
import { syncService } from '../index.ts'
import type { PhotoProgress } from '../types.ts'

const testDb = setUpTestDatabase()
const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

let store: PhotoStore

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  // A fresh photo store per test.
  store = photoService.open(crypto.randomUUID())
})

/** A picture whose bytes say which one it is. */
function picture(label: string) {
  return new Blob([label], { type: 'image/jpeg' })
}

/**
 * An expense with photos, each kept in the store unless listed in `notOnDevice`.
 * Returns the group, the user and the photo ids in order.
 */
async function expenseWithPhotos(count: number, { notOnDevice = [] as number[], groupName = 'Goa trip' } = {}) {
  const group = await createTestGroup(testDb.db, omkar, { name: groupName, type: 'trip', defaultCurrency: 'GBP' })
  if (!group.ok) throw new Error('group not created')
  const receipts = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    mimeType: 'image/jpeg',
    sizeBytes: 5 + index,
  }))
  for (const [index, receipt] of receipts.entries()) {
    if (!notOnDevice.includes(index)) await store.savePhoto(receipt.id, picture(`photo ${index}`), picture('thumb'))
  }
  const expenseId = await addTestExpense(testDb.db, omkar.email, group.groupId, { receipts })
  return { groupId: group.groupId, expenseId, userId: await personIdOf(testDb.db, omkar.email), ids: receipts.map((r) => r.id) }
}

/** The photo files in the fake Drive, by photo id. */
function photoFiles(drive: ReturnType<typeof createFakeDrive>) {
  return new Map(
    [...drive.files.values()]
      .filter((file) => file.properties?.ownledger === 'backup-photo')
      .map((file) => [file.properties!.ownledgerPhotoId, file]),
  )
}

describe('syncService.backUpPhotos', () => {
  it('uploads every photo to Backup/photos, named by its id and tagged with it, with its bytes', async () => {
    const { ids } = await expenseWithPhotos(2)
    const drive = createFakeDrive()

    const result = await syncService.backUpPhotos(testDb.db, drive.client, store)

    expect(result).toEqual({ failures: 0, outOfSpace: false })
    const folder = drive.named('photos')
    expect(folder).toMatchObject({ folder: true, parentId: drive.named('Backup')?.id, properties: { ownledger: 'backup-photos' } })
    const files = photoFiles(drive)
    expect([...files.keys()].sort()).toEqual([...ids].sort())
    expect(files.get(ids[0])).toMatchObject({ name: `${ids[0]}.jpg`, parentId: folder?.id })
    expect(await files.get(ids[1])!.blob!.text()).toBe('photo 1')
  })

  it('includes photos taken off an expense and photos of deleted expenses', async () => {
    const { groupId, expenseId, userId, ids } = await expenseWithPhotos(2)
    await testDb.db.update(expensePhotos).set({ deletedAt: new Date() }).where(eq(expensePhotos.id, ids[0]))
    await expenseService.deleteExpense(testDb.db, userId, groupId, expenseId)
    const drive = createFakeDrive()

    await syncService.backUpPhotos(testDb.db, drive.client, store)

    expect(photoFiles(drive).size).toBe(2)
  })

  it('uploads only what Drive does not have yet, and reports the progress', async () => {
    await expenseWithPhotos(2)
    const drive = createFakeDrive()
    await syncService.backUpPhotos(testDb.db, drive.client, store)
    await expenseWithPhotos(1, { groupName: 'Lisbon' })
    const progress: PhotoProgress[] = []

    await syncService.backUpPhotos(testDb.db, drive.client, store, (step) => progress.push(step))

    expect(photoFiles(drive).size).toBe(3)
    expect(progress).toEqual([{ current: 1, total: 1 }])
  })

  it('counts the photo being worked on, from 1 up to the total, never 0', async () => {
    await expenseWithPhotos(4)
    const drive = createFakeDrive()
    const progress: PhotoProgress[] = []

    await syncService.backUpPhotos(testDb.db, drive.client, store, (step) => progress.push(step))

    // Three go at once, so the count is a place in the list rather than the photos in flight.
    expect(progress).toEqual([1, 2, 3, 4].map((current) => ({ current, total: 4 })))
  })

  it('reports nothing when there is nothing to upload or download', async () => {
    await expenseWithPhotos(2)
    const drive = createFakeDrive()
    await syncService.backUpPhotos(testDb.db, drive.client, store)
    const progress: PhotoProgress[] = []

    await syncService.backUpPhotos(testDb.db, drive.client, store, (step) => progress.push(step))
    await syncService.restorePhotos(testDb.db, drive.client, store, (step) => progress.push(step))

    expect(progress).toEqual([])
  })

  it('skips a photo that is not on this device, without counting it as failed', async () => {
    const { ids } = await expenseWithPhotos(2, { notOnDevice: [1] })
    const drive = createFakeDrive()

    expect(await syncService.backUpPhotos(testDb.db, drive.client, store)).toEqual({ failures: 0, outOfSpace: false })
    expect([...photoFiles(drive).keys()]).toEqual([ids[0]])
  })

  it('counts a photo that fails and carries on with the others', async () => {
    const { ids } = await expenseWithPhotos(3)
    const drive = createFakeDrive()
    const createFile = drive.client.createFile
    vi.spyOn(drive.client, 'createFile').mockImplementation(async (...args) => {
      if (args[4]?.ownledgerPhotoId === ids[1]) throw new Error('upload failed')
      return createFile(...args)
    })

    expect(await syncService.backUpPhotos(testDb.db, drive.client, store)).toEqual({ failures: 1, outOfSpace: false })
    expect([...photoFiles(drive).keys()].sort()).toEqual([ids[0], ids[2]].sort())
  })

  it('stops when Drive access runs out', async () => {
    await expenseWithPhotos(5)
    const drive = createFakeDrive()
    await syncService.backUpPhotos(testDb.db, drive.client, store).catch(() => undefined)
    for (const [id, file] of drive.files) if (file.properties?.ownledger === 'backup-photo') drive.files.delete(id)
    vi.spyOn(drive.client, 'createFile').mockRejectedValue(new DriveAuthError())

    await expect(syncService.backUpPhotos(testDb.db, drive.client, store)).rejects.toBeInstanceOf(DriveAuthError)
    // No more than the photos already on their way were tried.
    expect(vi.mocked(drive.client.createFile).mock.calls.length).toBeLessThanOrEqual(3)
  })
})

describe('photo transfers and failures that stop a run', () => {
  it('stops at a dropped connection or a full Drive instead of counting every photo as failed', async () => {
    await expenseWithPhotos(3)
    const full = new DriveError(403, JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }))
    for (const failure of [new DriveError(0, 'Failed to fetch'), full]) {
      const drive = createFakeDrive()
      vi.spyOn(drive.client, 'createFile').mockRejectedValue(failure)

      await expect(syncService.backUpPhotos(testDb.db, drive.client, store)).rejects.toBe(failure)
    }
  })

  it('stops downloading at a dropped connection', async () => {
    const { ids } = await expenseWithPhotos(2)
    const drive = createFakeDrive()
    await syncService.backUpPhotos(testDb.db, drive.client, store)
    for (const id of ids) await store.deletePhoto(id)
    vi.spyOn(drive.client, 'downloadBlob').mockRejectedValue(new DriveError(0, 'Failed to fetch'))

    await expect(syncService.restorePhotos(testDb.db, drive.client, store)).rejects.toBeInstanceOf(DriveError)
  })
})

describe('syncService.restorePhotos', () => {
  /** Backs the photos up, then removes `missing` from the device. */
  async function backedUpThenLost(count: number, missing: number[]) {
    const setup = await expenseWithPhotos(count)
    const drive = createFakeDrive()
    await syncService.backUpPhotos(testDb.db, drive.client, store)
    for (const index of missing) await store.deletePhoto(setup.ids[index])
    return { ...setup, drive }
  }

  it('downloads the photos the device lacks, with a thumbnail, and reports the progress', async () => {
    const { ids, drive } = await backedUpThenLost(3, [0, 2])
    const progress: PhotoProgress[] = []
    // Drive hands a download back without the picture's type.
    const downloadBlob = drive.client.downloadBlob
    const downloads = vi.spyOn(drive.client, 'downloadBlob').mockImplementation(
      async (fileId) => new Blob([await (await downloadBlob(fileId)).text()]),
    )
    vi.spyOn(photoService, 'makeThumbnail').mockImplementation(async (photo) => new Blob([`small ${await photo.text()}`]))

    const result = await syncService.restorePhotos(testDb.db, drive.client, store, (step) => progress.push(step))

    expect(result).toEqual({ failures: 0, outOfSpace: false })
    expect(downloads).toHaveBeenCalledTimes(2)
    expect(await (await store.getPhoto(ids[0]))!.text()).toBe('photo 0')
    expect((await store.getPhoto(ids[0]))!.type).toBe('image/jpeg')
    expect(await (await store.getThumbnail(ids[2]))!.text()).toBe('small photo 2')
    expect(progress).toEqual([{ current: 1, total: 2 }, { current: 2, total: 2 }])
  })

  it('does nothing when there is no photos folder in the Drive', async () => {
    await expenseWithPhotos(1)
    const drive = createFakeDrive()

    expect(await syncService.restorePhotos(testDb.db, drive.client, store)).toEqual({ failures: 0, outOfSpace: false })
  })

  it('counts a photo that fails and carries on with the others', async () => {
    const { ids, drive } = await backedUpThenLost(3, [0, 1, 2])
    const fileOf = photoFiles(drive)
    const downloadBlob = drive.client.downloadBlob
    vi.spyOn(drive.client, 'downloadBlob').mockImplementation(async (fileId) => {
      if (fileId === fileOf.get(ids[1])!.id) throw new Error('download failed')
      return downloadBlob(fileId)
    })

    expect(await syncService.restorePhotos(testDb.db, drive.client, store)).toEqual({ failures: 1, outOfSpace: false })
    expect(await store.getPhoto(ids[0])).not.toBeNull()
    expect(await store.getPhoto(ids[1])).toBeNull()
    expect(await store.getPhoto(ids[2])).not.toBeNull()
  })

  it('stops downloading when the device runs out of space', async () => {
    const { drive } = await backedUpThenLost(6, [0, 1, 2, 3, 4, 5])
    const downloads = vi.spyOn(drive.client, 'downloadBlob')
    vi.spyOn(store, 'savePhoto').mockRejectedValue(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))

    expect(await syncService.restorePhotos(testDb.db, drive.client, store)).toEqual({ failures: 0, outOfSpace: true })
    expect(downloads.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('stops when Drive access runs out', async () => {
    const { drive } = await backedUpThenLost(2, [0, 1])
    vi.spyOn(drive.client, 'downloadBlob').mockRejectedValue(new DriveAuthError())

    await expect(syncService.restorePhotos(testDb.db, drive.client, store)).rejects.toBeInstanceOf(DriveAuthError)
  })
})
