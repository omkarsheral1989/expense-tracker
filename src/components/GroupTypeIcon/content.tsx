import {
  AppstoreOutlined,
  CarOutlined,
  HeartOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { GROUP_TYPE_LABELS } from '../../db/constants.ts'
import type { GroupType } from '../../db/types.ts'
import { GROUP_TYPE_COLORS } from '../../theme/groupTypeColors.ts'

type GroupTypeContent = {
  label: string
  icon: ReactNode
  /** The tile's background; the icon on it is white. */
  color: string
}

/** How each kind of group looks. Every type must have an entry. */
export const GROUP_TYPE_CONTENT: Record<GroupType, GroupTypeContent> = {
  trip: { label: GROUP_TYPE_LABELS.trip, icon: <CarOutlined />, color: GROUP_TYPE_COLORS.trip },
  home: { label: GROUP_TYPE_LABELS.home, icon: <HomeOutlined />, color: GROUP_TYPE_COLORS.home },
  couple: { label: GROUP_TYPE_LABELS.couple, icon: <HeartOutlined />, color: GROUP_TYPE_COLORS.couple },
  other: { label: GROUP_TYPE_LABELS.other, icon: <AppstoreOutlined />, color: GROUP_TYPE_COLORS.other },
}
