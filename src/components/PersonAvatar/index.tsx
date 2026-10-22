import { Avatar, theme } from 'antd'
import { useState, type CSSProperties } from 'react'
import { usePersonPicture } from '../../hooks/usePersonPicture'
import { CONTROL_HEIGHT } from '../../theme/controlHeight.ts'

type Props = {
  /** The name shown for the person; its first letter is the avatar when there is no picture. */
  name: string
  /** The address of their Google picture, once known (ADR-046). */
  picture?: string | null
  /** The width and height in px; 40, like the controls beside it, unless given. */
  size?: number
  style?: CSSProperties
}

/**
 * A person's avatar: their Google picture (from this device's own copy when it
 * has one), or the first letter of their name in the app's teal when there is
 * none or it cannot be loaded.
 */
export function PersonAvatar({ name, picture, size = CONTROL_HEIGHT, style }: Props) {
  const { token } = theme.useToken()
  const source = usePersonPicture(picture)
  // A picture that failed to load stays failed for that address.
  const [failed, setFailed] = useState<string | null>(null)
  const showPicture = source !== undefined && failed !== source

  return (
    <Avatar
      size={size}
      // No border: Ant Design's 1 px transparent one would leave the picture 2 px smaller than the avatar.
      style={{ background: token.colorPrimaryBg, color: token.colorPrimary, border: 0, ...style }}
      src={
        showPicture ? (
          <img src={source} alt="" referrerPolicy="no-referrer" onError={() => setFailed(source)} />
        ) : undefined
      }
    >
      {name.charAt(0).toUpperCase()}
    </Avatar>
  )
}
