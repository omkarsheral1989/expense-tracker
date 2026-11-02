import { Icon } from '../../../../components/Icon'
import type { ReactNode } from 'react'

export type Highlight = { icon: ReactNode; text: string }

export const HIGHLIGHTS: Highlight[] = [
  {
    icon: <Icon name="users" />,
    text: 'Track your own spending and share costs with trips, homes and partners.',
  },
  {
    icon: <Icon name="lock" />,
    text: 'Works offline, and your data stays with you.',
  },
  { icon: <Icon name="github" />, text: 'Free and open source.' },
]
