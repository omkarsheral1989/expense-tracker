import {
  DRIVE_API,
  DRIVE_UPLOAD_API,
  FOLDER_MIME_TYPE,
  OWNLEDGER_PROPERTY,
  SHORTCUT_MIME_TYPE,
} from './constants.ts'
import type { DriveClient, DriveFile, DriveItemKind, DriveOwner } from './types.ts'

const FILE_FIELDS = 'id,name,modifiedTime,properties'

/** Drive refused the token: it expired or was revoked. A new one needs a press (ADR-019). */
export class DriveAuthError extends Error {
  constructor() {
    super('Drive access expired.')
    this.name = 'DriveAuthError'
  }
}

/**
 * Any other failed Drive request, with its HTTP status (0 when the network
 * failed) and `reason`, the status with Google's own message, short enough to
 * show ("403: The user does not have sufficient permissions for this file.").
 */
export class DriveError extends Error {
  readonly status: number
  readonly reason: string
  constructor(status: number, detail: string) {
    super(`Drive request failed (${status}): ${detail}`)
    this.name = 'DriveError'
    this.status = status
    this.reason = `${status}: ${googleMessage(detail)}`
  }
}

// Google's errors are JSON with the message at error.message; anything else is shown as it came.
function googleMessage(detail: string): string {
  try {
    const message = (JSON.parse(detail) as { error?: { message?: unknown } }).error?.message
    if (typeof message === 'string' && message) return message
  } catch {
    // not JSON
  }
  return detail || 'No reason given.'
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

// The same for a file of any type, such as a photo: its bytes go between the two text parts.
function multipartBlobBody(metadata: object, content: Blob) {
  const boundary = `ownledger-${crypto.randomUUID()}`
  const head = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${content.type || 'application/octet-stream'}`,
    '',
    '',
  ].join('\r\n')
  const body = new Blob([head, content, `\r\n--${boundary}--\r\n`])
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

  /** Files with this tag and these properties, the oldest first, so a duplicate made by a race is never the one used. */
  async function find(
    kind: DriveItemKind,
    { owner, parentId, properties = {}, limit }: { owner: DriveOwner; parentId?: string; properties?: Record<string, string>; limit?: number },
  ): Promise<DriveFile[]> {
    const conditions = [
      ...Object.entries({ [OWNLEDGER_PROPERTY]: kind, ...properties }).map(
        ([key, value]) => `properties has { key=${quote(key)} and value=${quote(value)} }`,
      ),
      'trashed = false',
    ]
    if (owner === 'me') conditions.push(`'me' in owners`)
    if (owner === 'others') conditions.push(`not 'me' in owners`)
    if (parentId) conditions.push(`${quote(parentId)} in parents`)

    const files: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: conditions.join(' and '),
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        spaces: 'drive',
        orderBy: 'createdTime',
        pageSize: String(limit ?? 1000),
      })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await json<{ files: DriveFile[]; nextPageToken?: string }>(`${DRIVE_API}?${params}`)
      files.push(...page.files)
      pageToken = limit && files.length >= limit ? undefined : page.nextPageToken
    } while (pageToken)
    return files
  }

  return {
    async findOwn(kind, parentId, properties) {
      return (await find(kind, { owner: 'me', parentId, properties, limit: 1 }))[0] ?? null
    },

    findAll(kind, owner, properties) {
      return find(kind, { owner, properties })
    },

    createFolder(name, kind, parentId, properties = {}) {
      return json<DriveFile>(`${DRIVE_API}?fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME_TYPE,
          parents: parentId ? [parentId] : undefined,
          properties: { ...properties, [OWNLEDGER_PROPERTY]: kind },
        }),
      })
    },

    createJson(name, kind, parentId, content, properties = {}) {
      const { body, contentType } = multipartBody(
        {
          name,
          mimeType: 'application/json',
          parents: [parentId],
          properties: { ...properties, [OWNLEDGER_PROPERTY]: kind },
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

    async listChildren(parentId) {
      const files: DriveFile[] = []
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({
          q: `${quote(parentId)} in parents and trashed = false`,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          spaces: 'drive',
          pageSize: '1000',
        })
        if (pageToken) params.set('pageToken', pageToken)
        const page = await json<{ files: DriveFile[]; nextPageToken?: string }>(`${DRIVE_API}?${params}`)
        files.push(...page.files)
        pageToken = page.nextPageToken
      } while (pageToken)
      return files
    },

    createFile(name, kind, parentId, content, properties = {}) {
      const { body, contentType } = multipartBlobBody(
        {
          name,
          mimeType: content.type || undefined,
          parents: [parentId],
          properties: { ...properties, [OWNLEDGER_PROPERTY]: kind },
        },
        content,
      )
      return json<DriveFile>(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      })
    },

    async downloadBlob(fileId) {
      return (await request(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`)).blob()
    },

    rename(fileId, name) {
      return json<DriveFile>(`${DRIVE_API}/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    },

    async sharedWith(fileId) {
      const emails: string[] = []
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({ fields: 'nextPageToken,permissions(emailAddress)', pageSize: '100' })
        if (pageToken) params.set('pageToken', pageToken)
        const page = await json<{ permissions: { emailAddress?: string }[]; nextPageToken?: string }>(
          `${DRIVE_API}/${encodeURIComponent(fileId)}/permissions?${params}`,
        )
        for (const permission of page.permissions) {
          if (permission.emailAddress) emails.push(permission.emailAddress.toLowerCase())
        }
        pageToken = page.nextPageToken
      } while (pageToken)
      return emails
    },

    async share(fileId, email) {
      // Drive sends its usual "shared a folder with you" email (decided, ADR-044).
      await json(`${DRIVE_API}/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
      })
    },

    createShortcut(name, kind, parentId, targetId, properties = {}) {
      return json<DriveFile>(`${DRIVE_API}?fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: SHORTCUT_MIME_TYPE,
          parents: [parentId],
          shortcutDetails: { targetId },
          properties: { ...properties, [OWNLEDGER_PROPERTY]: kind },
        }),
      })
    },
  }
}

export const driveService = { client }
