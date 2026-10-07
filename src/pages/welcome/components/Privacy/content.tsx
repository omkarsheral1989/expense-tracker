import {
  DisconnectOutlined,
  EyeInvisibleOutlined,
  GithubOutlined,
  KeyOutlined,
  ShareAltOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Typography } from 'antd'
import type { ReactNode } from 'react'
import { REPO_URL } from '../../constants.ts'

const { Link } = Typography

export type PrivacyPoint = { icon: ReactNode; title: string; text: ReactNode }

export const PRIVACY: PrivacyPoint[] = [
  {
    icon: <DisconnectOutlined />,
    title: 'Offline first',
    text: 'Everything is stored on your device. The app works without a connection.',
  },
  {
    icon: <StopOutlined />,
    title: 'No OwnLedger servers',
    text: 'There is no backend that stores your expenses.',
  },
  {
    icon: <EyeInvisibleOutlined />,
    title: 'Privacy first',
    text: 'No ads and no tracking.',
  },
  {
    icon: <KeyOutlined />,
    title: 'You own your data',
    text: 'Back it up to your own Google Drive, export it to CSV, or delete it any time.',
  },
  {
    icon: <ShareAltOutlined />,
    title: 'Shared on your terms',
    text: 'Group data is shared through your own Google Drive folder, only with the people you add.',
  },
  {
    icon: <GithubOutlined />,
    title: 'Open source',
    text: (
      <>
        The code is public, so you can read exactly what the app does.{' '}
        <Link href={REPO_URL} target="_blank" rel="noreferrer">
          View on GitHub
        </Link>{' '}
        (GPL-3.0)
      </>
    ),
  },
]
