import {
  CompassOutlined,
  HeartOutlined,
  HomeOutlined,
  TagOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { GroupType } from '../../db/types.ts'

type GroupTypeContent = {
  label: string
  icon: ReactNode
  /** The tile's background; the icon on it is white. */
  color: string
}

/** How each kind of group looks. Every type must have an entry. */
export const GROUP_TYPE_CONTENT: Record<GroupType, GroupTypeContent> = {
  trip: { label: 'Trip', icon: <CompassOutlined />, color: '#0d9488' },
  home: { label: 'Home', icon: <HomeOutlined />, color: '#d46b08' },
  couple: { label: 'Couple', icon: <HeartOutlined />, color: '#c41d7f' },
  other: { label: 'Other', icon: <TagOutlined />, color: '#3b5bdb' },
}
