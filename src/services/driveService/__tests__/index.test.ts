import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveAuthError, DriveError, driveService, stoppingProblem } from '../index.ts'

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
    await client.updateJson('f3', { a: 2 }, { ownledgerPersonId: 'p2' })

    const [createUrl, create] = fetchMock.mock.calls[0]
    expect(String(createUrl)).toContain('/upload/drive/v3/files?uploadType=multipart')
    expect(String(create?.body)).toContain('"properties":{"ownledger":"backup-file"}')
    expect(String(create?.body)).toContain('{"a":1}')
    const [updateUrl, update] = fetchMock.mock.calls[1]
    expect(String(updateUrl)).toContain('/upload/drive/v3/files/f3?uploadType=multipart')
    expect(update?.method).toBe('PATCH')
    expect(String(update?.body)).toContain('{"a":2}')
    expect(String(update?.body)).toContain('"properties":{"ownledgerPersonId":"p2"}')
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

  it('finds the app\'s items by tag and properties, by owner, across pages', async () => {
    const client = drive()
    respond({ files: [{ id: 'g1', name: 'Goa' }], nextPageToken: 'next' })
    respond({ files: [{ id: 'g2', name: 'Flat' }] })
    respond({ files: [] })
    respond({ files: [] })

    expect((await client.findAll('group', 'any', { ownledgerGroupId: 'abc' })).map((file) => file.id)).toEqual(['g1', 'g2'])
    await client.findAll('group', 'others')
    await client.findOwn('member-file', 'folder-1', { ownledgerPersonId: 'p1' })

    const query = (call: number) => new URL(String(fetchMock.mock.calls[call][0])).searchParams.get('q')!
    expect(query(0)).toContain("properties has { key='ownledger' and value='group' }")
    expect(query(0)).toContain("properties has { key='ownledgerGroupId' and value='abc' }")
    expect(query(0)).not.toContain('owners')
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('pageToken')).toBe('next')
    expect(query(2)).toContain("not 'me' in owners")
    expect(query(3)).toContain("'me' in owners")
    expect(query(3)).toContain("properties has { key='ownledgerPersonId' and value='p1' }")
    expect(query(3)).toContain("'folder-1' in parents")
  })

  it('creates folders and JSON files with further properties', async () => {
    const client = drive()
    respond({ id: 'f1', name: 'Goa' })
    respond({ id: 'f2', name: 'p1.json' })

    await client.createFolder('Goa', 'group', 'groups-1', { ownledgerGroupId: 'abc' })
    await client.createJson('p1.json', 'member-file', 'f1', { a: 1 }, { ownledgerPersonId: 'p1' })

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).properties).toEqual({ ownledgerGroupId: 'abc', ownledger: 'group' })
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"properties":{"ownledgerPersonId":"p1","ownledger":"member-file"}')
  })

  it('renames a file', async () => {
    const client = drive()
    respond({ id: 'f1', name: 'Goa 2026' })

    await client.rename('f1', 'Goa 2026')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/drive/v3/files/f1?')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Goa 2026' })
  })

  it('lists whom a folder is shared with, lower-cased, across pages, and shares it as an editor with Drive\'s email', async () => {
    const client = drive()
    respond({ permissions: [{ emailAddress: 'Omkar@gmail.com' }, { type: 'anyone' }], nextPageToken: 'n' })
    respond({ permissions: [{ emailAddress: 'priya@gmail.com' }] })
    respond({})

    expect(await client.sharedWith('f1')).toEqual(['omkar@gmail.com', 'priya@gmail.com'])
    await client.share('f1', 'dev@gmail.com')

    const [url, init] = fetchMock.mock.calls[2]
    expect(String(url)).toContain('/files/f1/permissions?sendNotificationEmail=true')
    expect(JSON.parse(String(init?.body))).toEqual({ type: 'user', role: 'writer', emailAddress: 'dev@gmail.com' })
  })

  it('makes a shortcut to a folder, tagged', async () => {
    const client = drive()
    respond({ id: 's1', name: 'Goa' })

    await client.createShortcut('Goa', 'group-shortcut', 'groups-1', 'f1', { ownledgerGroupId: 'abc' })

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: 'Goa',
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: ['groups-1'],
      shortcutDetails: { targetId: 'f1' },
      properties: { ownledgerGroupId: 'abc', ownledger: 'group-shortcut' },
    })
  })

  it('gives a short reason for a refusal: the status and Google\'s own message', async () => {
    const client = drive()
    respond(JSON.stringify({ error: { code: 403, message: 'The user does not have sufficient permissions for this file.' } }), 403)
    respond('plain text', 404)

    expect(((await client.findOwn('root').catch((error: unknown) => error)) as DriveError).reason).toBe(
      '403: The user does not have sufficient permissions for this file.',
    )
    expect(((await client.findOwn('root').catch((error: unknown) => error)) as DriveError).reason).toBe('404: plain text')
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

describe('retries', () => {
  const googleError = (status: number, reason?: string) =>
    JSON.stringify({ error: { code: status, message: 'Refused', errors: reason ? [{ reason }] : [] } })

  /** A client whose waits are recorded instead of waited. */
  function waitingDrive() {
    vi.stubGlobal('fetch', fetchMock)
    const waits: number[] = []
    const client = driveService.client('token-1', { wait: async (ms) => void waits.push(ms) })
    return { client, waits }
  }

  it('tries a request Drive refused for a moment again, after 1, 2 and 4 seconds, and gives the answer', async () => {
    const { client, waits } = waitingDrive()
    respond(googleError(503), 503)
    respond(googleError(429), 429)
    respond(googleError(403, 'userRateLimitExceeded'), 403)
    respond({ files: [{ id: 'f1', name: 'OwnLedger' }] })

    expect(await client.findOwn('root')).toEqual({ id: 'f1', name: 'OwnLedger' })
    expect(waits).toEqual([1000, 2000, 4000])
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('gives up after 3 retries with Drive\'s refusal', async () => {
    const { client } = waitingDrive()
    for (let index = 0; index < 4; index++) respond(googleError(500), 500)

    const error = await client.findOwn('root').catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(DriveError)
    expect((error as DriveError).status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not retry other refusals, expired access, a full Drive or a dropped connection', async () => {
    const { client, waits } = waitingDrive()
    respond(googleError(403, 'insufficientFilePermissions'), 403)
    respond(googleError(404), 404)
    respond('expired', 401)
    respond(googleError(403, 'storageQuotaExceeded'), 403)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    for (let index = 0; index < 5; index++) await client.findOwn('root').catch(() => undefined)

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(waits).toEqual([])
  })

  it('sends an upload again in full when it is retried', async () => {
    const { client } = waitingDrive()
    respond(googleError(503), 503)
    respond({ id: 'p1', name: 'abc.jpg' })

    await client.createFile('abc.jpg', 'backup-photo', 'folder-1', new Blob(['JPEG BYTES'], { type: 'image/jpeg' }))

    const second = await new Response(fetchMock.mock.calls[1][1]?.body as Blob).text()
    expect(second).toContain('JPEG BYTES')
  })
})

describe('stoppingProblem', () => {
  it('names the failures that stop a sync run, and nothing else', () => {
    const full = new DriveError(403, JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }))
    expect(stoppingProblem(new DriveAuthError())).toBe('expired')
    expect(stoppingProblem(new DriveError(0, 'Failed to fetch'))).toBe('connection')
    expect(stoppingProblem(full)).toBe('driveFull')
    expect(stoppingProblem(new DriveError(403, JSON.stringify({ error: { errors: [{ reason: 'insufficientFilePermissions' }] } })))).toBeNull()
    expect(stoppingProblem(new DriveError(500, 'Backend Error'))).toBeNull()
    expect(stoppingProblem(new Error('anything'))).toBeNull()
  })

  it('tells which refusals are worth retrying', () => {
    expect(new DriveError(429, '').retryable).toBe(true)
    expect(new DriveError(502, '').retryable).toBe(true)
    expect(new DriveError(403, JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } })).retryable).toBe(true)
    expect(new DriveError(403, '').retryable).toBe(false)
    expect(new DriveError(400, '').retryable).toBe(false)
    expect(new DriveError(0, '').retryable).toBe(false)
  })
})
