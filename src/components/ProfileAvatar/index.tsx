import { Avatar } from 'antd'
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
  return (
    <Avatar
      size={size}
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
