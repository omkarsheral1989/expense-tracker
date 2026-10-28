import type { CSSProperties } from 'react'
import { ICONS, type IconName } from './icons.ts'

type Props = {
  /** Which icon, from `ICONS`. */
  name: IconName
  /** Width and height; the default `1em` follows the text's font size, like the icons of Ant Design. */
  size?: number | string
  /** Turns the icon round and round, for something that is working. */
  spin?: boolean
  /** What a screen reader says; without it the icon is decoration and is hidden from them. */
  label?: string
  /** Ant Design adds its own class to an icon it is given (for a menu item, say), so it must reach the SVG. */
  className?: string
  style?: CSSProperties
}

/** One icon of the app (ADR-066), drawn as an SVG that takes the text's color. */
export function Icon({ name, size = '1em', spin, label, className, style }: Props) {
  const Component = ICONS[name]
  const accessibility = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return <Component size={size} stroke={1.75} className={[className, spin ? 'icon-spin' : ''].filter(Boolean).join(' ') || undefined} style={style} {...accessibility} />
}
