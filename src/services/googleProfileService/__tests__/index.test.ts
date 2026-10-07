import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleProfileService } from '../index.ts'

function respondWith(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), init),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('googleProfileService.fetchProfile', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks Google for the profile with the access token', async () => {
    const fetchMock = respondWith({ sub: '1', email: 'a@gmail.com' })

    await googleProfileService.fetchProfile('token-123')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: 'Bearer token-123' } },
    )
  })

  it('turns Google\'s answer into a profile', async () => {
    respondWith({
      sub: '108',
      email: 'omkar@gmail.com',
      name: 'Omkar',
      picture: 'https://example.com/me.png',
    })

    await expect(googleProfileService.fetchProfile('t')).resolves.toEqual({
      id: '108',
      email: 'omkar@gmail.com',
      name: 'Omkar',
      picture: 'https://example.com/me.png',
    })
  })

  it('uses the email as the name when Google gives none', async () => {
    respondWith({ sub: '1', email: 'a@gmail.com' })

    const profile = await googleProfileService.fetchProfile('t')

    expect(profile.name).toBe('a@gmail.com')
    expect(profile.picture).toBeUndefined()
  })

  it('fails with the status when Google refuses the request', async () => {
    respondWith({ error: 'invalid_token' }, { status: 401 })

    await expect(googleProfileService.fetchProfile('bad')).rejects.toThrow(
      'Google profile request failed (401)',
    )
  })

  it('does not trust an answer without an account id or email', async () => {
    respondWith({ email: 'a@gmail.com' })
    await expect(googleProfileService.fetchProfile('t')).rejects.toThrow()

    respondWith({ sub: '1' })
    await expect(googleProfileService.fetchProfile('t')).rejects.toThrow()
  })
})
