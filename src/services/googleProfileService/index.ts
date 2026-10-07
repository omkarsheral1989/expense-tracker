import type { Profile } from './types.ts'
import { userInfoSchema } from './schemas.ts'

export const googleProfileService = {
  /** Reads the signed-in user's profile from Google with a fresh access token. */
  async fetchProfile(accessToken: string): Promise<Profile> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!response.ok) {
      throw new Error(`Google profile request failed (${response.status})`)
    }

    const info = userInfoSchema.parse(await response.json())
    return {
      id: info.sub,
      email: info.email,
      name: info.name ?? info.email,
      picture: info.picture,
    }
  },
}
