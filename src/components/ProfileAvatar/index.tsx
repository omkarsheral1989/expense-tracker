import { Avatar, theme } from 'antd'
import { CONTROL_HEIGHT } from '../../theme/controlHeight.ts'
import type { Profile } from '../../services/googleProfileService/types.ts'

type Props = {
  /** A Google profile, or just a name ("Guest") for someone who has not signed in. */
  profile: Pick<Profile, 'name' | 'picture'>
  size?: number
}

/**
 * The user's Google picture, or the first letter of their name when there is no
 * picture or it fails to load. Google pictures only load without a referrer.
 */
export function ProfileAvatar({ profile, size = CONTROL_HEIGHT }: Props) {
  const { token } = theme.useToken()

  return (
    <Avatar
      size={size}
      // The initial in the app's teal, which reads better than the default grey. No border:
      // Ant Design's 1 px transparent one would leave the picture 2 px smaller than the avatar.
      style={{ background: token.colorPrimaryBg, color: token.colorPrimary, border: 0 }}
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
