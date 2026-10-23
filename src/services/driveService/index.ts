import {
  DRIVE_API,
  DRIVE_FULL_REASON,
  DRIVE_UPLOAD_API,
  FOLDER_MIME_TYPE,
  OWNLEDGER_PROPERTY,
  RATE_LIMIT_REASONS,
  REQUEST_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  SHORTCUT_MIME_TYPE,
} from './constants.ts'
import { logService } from '../logService'
import type { ClientOptions, DriveClient, DriveFile, DriveItemKind, DriveOwner, StoppingProblem } from './types.ts'

const FILE_FIELDS = 'id,name,modifiedTime,properties'

const log = logService.scope('drive')

// The kind of request, without ids or the query: enough to follow a run in the console.
function describeRequest(url: string, init: RequestInit) {
  return { method: init.method ?? 'GET', path: new URL(url).pathname.replace(/\/files\/[^/]+/, '/files/:id') }
}

/** Drive refused the token: it expired or was revoked. A new one needs a press (ADR-019). */
export class DriveAuthError extends Error {
  constructor() {
    super('Drive access expired.')
    this.name = 'DriveAuthError'
  }
}

/** The user pressed Stop: the request in flight was cancelled and nothing more is sent. */
export class DriveStopped extends Error {
  constructor() {
    super('The sync was stopped.')
    this.name = 'DriveStopped'
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
  /** Google's own reason codes for the refusal, such as 'storageQuotaExceeded'. */
  readonly codes: string[]
  constructor(status: number, detail: string) {
    super(`Drive request failed (${status}): ${detail}`)
    this.name = 'DriveError'
    this.status = status
    const google = googleError(detail)
    this.reason = `${status}: ${google.message ?? (detail || 'No reason given.')}`
    this.codes = google.codes
  }

  /** The request never got an answer: the connection dropped. */
  get connectionLost(): boolean {
    return this.status === 0
  }

  /** The user's Drive has no room left. */
  get driveFull(): boolean {
    return this.codes.includes(DRIVE_FULL_REASON)
  }

  /** Drive refused for a moment (too many requests, or a server error): worth trying again. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || (this.status === 403 && this.codes.some((code) => RATE_LIMIT_REASONS.includes(code)))
  }
}

// Google's errors are JSON with the message at error.message and the reasons at error.errors[].reason.
function googleError(detail: string): { message?: string; codes: string[] } {
  try {
    const error = (JSON.parse(detail) as { error?: { message?: unknown; errors?: { reason?: unknown }[] } }).error
    const codes = (error?.errors ?? []).flatMap((each) => (typeof each.reason === 'string' ? [each.reason] : []))
    const message = typeof error?.message === 'string' && error.message ? error.message : undefined
    return { message, codes }
  } catch {
    return { codes: [] } // not JSON
  }
}

/** Whether a failure stops the whole sync run, and which one it is; null for one a run carries on after. */
export function stoppingProblem(error: unknown): StoppingProblem | null {
  if (error instanceof DriveStopped) return 'stopped'
  if (error instanceof DriveAuthError) return 'expired'
  if (error instanceof DriveError && error.connectionLost) return 'connection'
  if (error instanceof DriveError && error.driveFull) return 'driveFull'
  return null
}

const waitFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
 * A request Drive refuses for a moment is tried again up to 3 times, after
 * 1, 2 and 4 seconds; a dropped connection is not.
 */
function client(accessToken: string, { wait = waitFor, signal, timeoutMs = REQUEST_TIMEOUT_MS }: ClientOptions = {}): DriveClient {
  async function attempt(url: string, init: RequestInit): Promise<Response> {
    if (signal?.aborted) throw new DriveStopped()
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
        // A request that gets no answer in time counts as a dropped connection; Stop cancels it at once.
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
      })
    } catch (error) {
      if (signal?.aborted) throw new DriveStopped()
      throw new DriveError(0, error instanceof Error ? error.message : String(error))
    }
    if (response.status === 401) throw new DriveAuthError()
    if (!response.ok) throw new DriveError(response.status, await response.text().catch(() => ''))
    return response
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const startedAt = Date.now()
    for (let retry = 0; ; retry++) {
      try {
        const response = await attempt(url, init)
        log.debug('Drive request done', { ...describeRequest(url, init), status: response.status, retries: retry, ms: Date.now() - startedAt })
        return response
      } catch (error) {
        const final = !(error instanceof DriveError) || !error.retryable || retry >= RETRY_DELAYS_MS.length
        if (final) {
          log.warn('Drive request failed', { ...describeRequest(url, init), ...logService.errorFields(error), retries: retry })
          throw error
        }
        log.warn('Drive request refused, trying again', { ...describeRequest(url, init), status: error.status, afterMs: RETRY_DELAYS_MS[retry] })
        await wait(RETRY_DELAYS_MS[retry])
      }
    }
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

    updateJson(fileId, content, properties) {
      const { body, contentType } = multipartBody({ mimeType: 'application/json', properties }, content)
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
