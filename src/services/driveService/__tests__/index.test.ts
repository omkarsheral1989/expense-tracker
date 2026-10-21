import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveAuthError, DriveError, driveService } from '../index.ts'

const fetchMock = vi.fn<typeof fetch>()

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

function drive() {
  vi.stubGlobal('fetch', fetchMock)
  return driveService.client('token-1')
}

describe('driveService.client', () => {
  it('finds the user\'s own item by its tag (and parent), never by name, with the token', async () => {
    const client = drive()
    respond({ files: [{ id: 'f1', name: 'Backup' }] })

    expect(await client.findOwn('backup', 'root-1')).toEqual({ id: 'f1', name: 'Backup' })

    const [url, init] = fetchMock.mock.calls[0]
    const query = new URL(String(url)).searchParams.get('q')
    expect(query).toContain("properties has { key='ownledger' and value='backup' }")
    expect(query).toContain("'me' in owners")
    expect(query).toContain('trashed = false')
    expect(query).toContain("'root-1' in parents")
    expect(query).not.toContain('name')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-1' })
  })

  it('finds nothing when Drive lists nothing', async () => {
    const client = drive()
    respond({ files: [] })
    expect(await client.findOwn('root')).toBeNull()
  })

  it('creates a folder tagged with its kind, inside its parent', async () => {
    const client = drive()
    respond({ id: 'f2', name: 'Backup' })

    await client.createFolder('Backup', 'backup', 'root-1')

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({
      name: 'Backup',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root-1'],
      properties: { ownledger: 'backup' },
    })
  })

  it('uploads JSON with its tag, and replaces a file\'s content', async () => {
    const client = drive()
    respond({ id: 'f3', name: 'backup.json' })
    respond({ id: 'f3', name: 'backup.json' })

    await client.createJson('backup.json', 'backup-file', 'folder-1', { a: 1 })
    await client.updateJson('f3', { a: 2 })

    const [createUrl, create] = fetchMock.mock.calls[0]
    expect(String(createUrl)).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(String(create?.body)).toContain('"properties":{"ownledger":"backup-file"}')
    expect(String(create?.body)).toContain('{"a":1}')
    const [updateUrl, update] = fetchMock.mock.calls[1]
    expect(String(updateUrl)).toContain('/upload/drive/v3/files/f3?uploadType=multipart')
    expect(update?.method).toBe('PATCH')
    expect(String(update?.body)).toContain('{"a":2}')
  })

  it('downloads a file\'s content as text', async () => {
    const client = drive()
    respond('{"hello":true}')
    expect(await client.download('f3')).toBe('{"hello":true}')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/files/f3?alt=media')
  })

  it('lists every file in a folder, following Drive\'s pages', async () => {
    const client = drive()
    respond({ files: [{ id: 'p1', name: 'a.jpg' }], nextPageToken: 'page-2' })
    respond({ files: [{ id: 'p2', name: 'b.jpg' }] })

    expect((await client.listChildren('folder-1')).map((file) => file.id)).toEqual(['p1', 'p2'])

    const first = new URL(String(fetchMock.mock.calls[0][0])).searchParams
    expect(first.get('q')).toBe("'folder-1' in parents and trashed = false")
    expect(first.get('fields')).toContain('properties')
    expect(first.has('pageToken')).toBe(false)
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('pageToken')).toBe('page-2')
  })

  it('uploads a picture with its type, its tag and further properties, and its bytes', async () => {
    const client = drive()
    respond({ id: 'p1', name: 'abc.jpg' })

    await client.createFile('abc.jpg', 'backup-photo', 'folder-1', new Blob(['JPEG BYTES'], { type: 'image/jpeg' }), {
      ownledgerPhotoId: 'abc',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/upload/drive/v3/files?uploadType=multipart')
    const body = await new Response(init?.body as Blob).text()
    expect(body).toContain('"properties":{"ownledgerPhotoId":"abc","ownledger":"backup-photo"}')
    expect(body).toContain('"parents":["folder-1"]')
    expect(body).toContain('Content-Type: image/jpeg\r\n\r\nJPEG BYTES\r\n--')
  })

  it('downloads a picture as a Blob', async () => {
    const client = drive()
    respond('JPEG BYTES')
    expect(await (await client.downloadBlob('p1')).text()).toBe('JPEG BYTES')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/files/p1?alt=media')
  })

  it('reports expired access, other refusals and a failed network apart', async () => {
    const client = drive()
    respond('expired', 401)
    await expect(client.findOwn('root')).rejects.toBeInstanceOf(DriveAuthError)

    respond('full', 403)
    const refused = await client.findOwn('root').catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(DriveError)
    expect((refused as DriveError).status).toBe(403)

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const offline = await client.findOwn('root').catch((error: unknown) => error)
    expect((offline as DriveError).status).toBe(0)
  })
})
