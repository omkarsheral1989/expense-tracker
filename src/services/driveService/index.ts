import {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  FOLDER_MIME_TYPE,
  OWNLEDGER_PROPERTY,
} from './constants.ts'
import type { DriveClient, DriveFile, DriveItemKind } from './types.ts'

const FILE_FIELDS = 'id,name,modifiedTime,properties'

/** Drive refused the token: it expired or was revoked. A new one needs a press (ADR-019). */
export class DriveAuthError extends Error {
  constructor() {
    super('Drive access expired.')
    this.name = 'DriveAuthError'
  }
}

/** Any other failed Drive request, with its HTTP status (0 when the network failed). */
export class DriveError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(`Drive request failed (${status}): ${detail}`)
    this.name = 'DriveError'
    this.status = status
  }
}

// Drive's query language quotes with single quotes; ids and kinds never hold one, but stay safe.
function quote(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function multipartBody(metadata: object, content: unknown) {
  const boundary = `ownledger-${crypto.randomUUID()}`
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(content),
    `--${boundary}--`,
    '',
  ].join('\r\n')
  return { body, contentType: `multipart/related; boundary=${boundary}` }
}

/**
 * Google Drive's REST API (v3) through `fetch`, for one access token. Every
 * file and folder the app makes is tagged with a Drive property
 * (`ownledger = <kind>`), and found again by it, never by name (ADR-044).
 */
function client(accessToken: string): DriveClient {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
      })
    } catch (error) {
      throw new DriveError(0, error instanceof Error ? error.message : String(error))
    }
    if (response.status === 401) throw new DriveAuthError()
    if (!response.ok) throw new DriveError(response.status, await response.text().catch(() => ''))
    return response
  }

  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await request(url, init)).json() as Promise<T>
  }

  return {
    async findOwn(kind: DriveItemKind, parentId?: string) {
      const conditions = [
        `properties has { key=${quote(OWNLEDGER_PROPERTY)} and value=${quote(kind)} }`,
        `'me' in owners`,
        'trashed = false',
      ]
      if (parentId) conditions.push(`${quote(parentId)} in parents`)
      const params = new URLSearchParams({
        q: conditions.join(' and '),
        fields: `files(${FILE_FIELDS})`,
        spaces: 'drive',
        // The oldest first, so a duplicate made by a race is never the one used.
        orderBy: 'createdTime',
        pageSize: '1',
      })
      const { files } = await json<{ files: DriveFile[] }>(`${DRIVE_API}?${params}`)
      return files[0] ?? null
    },

    createFolder(name, kind, parentId) {
      return json<DriveFile>(`${DRIVE_API}?fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME_TYPE,
          parents: parentId ? [parentId] : undefined,
          properties: { [OWNLEDGER_PROPERTY]: kind },
        }),
      })
    },

    createJson(name, kind, parentId, content) {
      const { body, contentType } = multipartBody(
        {
          name,
          mimeType: 'application/json',
          parents: [parentId],
          properties: { [OWNLEDGER_PROPERTY]: kind },
        },
        content,
      )
      return json<DriveFile>(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      })
    },

    updateJson(fileId, content) {
      const { body, contentType } = multipartBody({ mimeType: 'application/json' }, content)
      return json<DriveFile>(
        `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=${FILE_FIELDS}`,
        { method: 'PATCH', headers: { 'Content-Type': contentType }, body },
      )
    },

    async download(fileId) {
      return (await request(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`)).text()
    },
  }
}

export const driveService = { client }
