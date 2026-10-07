import { GithubOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

export type Highlight = { icon: ReactNode; text: string }

export const HIGHLIGHTS: Highlight[] = [
  {
    icon: <TeamOutlined />,
    text: 'Track your own spending and share costs with trips, homes and partners.',
  },
  {
    icon: <LockOutlined />,
    text: 'Works offline, and your data stays with you.',
  },
  { icon: <GithubOutlined />, text: 'Free and open source.' },
]
