import { Avatar, theme } from 'antd'
import { useState, type CSSProperties } from 'react'
import { usePersonPicture } from '../../hooks/usePersonPicture'

type Props = {
  /** The name shown for the person; its first letter is the avatar when there is no picture. */
  name: string
  /** The address of their Google picture, once known (ADR-046). */
  picture?: string | null
  size?: number
  style?: CSSProperties
}

/**
 * A person's avatar: their Google picture (from this device's own copy when it
 * has one), or the first letter of their name in the app's teal when there is
 * none or it cannot be loaded.
 */
export function PersonAvatar({ name, picture, size, style }: Props) {
  const { token } = theme.useToken()
  const source = usePersonPicture(picture)
  // A picture that failed to load stays failed for that address.
  const [failed, setFailed] = useState<string | null>(null)
  const showPicture = source !== undefined && failed !== source

  return (
    <Avatar
      size={size}
      style={{ background: token.colorPrimaryBg, color: token.colorPrimary, ...style }}
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
