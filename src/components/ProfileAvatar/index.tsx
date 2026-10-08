import { Avatar, theme } from 'antd'
import type { Profile } from '../../services/googleProfileService/types.ts'

type Props = {
  profile: Profile
  size?: number
}

/**
 * The user's Google picture, or the first letter of their name when there is no
 * picture or it fails to load. Google pictures only load without a referrer.
 */
export function ProfileAvatar({ profile, size = 32 }: Props) {
  const { token } = theme.useToken()

  return (
    <Avatar
      size={size}
      // The initial in the app's teal, which reads better than the default grey.
      style={{ background: token.colorPrimaryBg, color: token.colorPrimary }}
      src={
        profile.picture ? (
          <img src={profile.picture} alt="" referrerPolicy="no-referrer" />
        ) : undefined
      }
    >
      {profile.name.charAt(0).toUpperCase()}
    </Avatar>
  )
}
