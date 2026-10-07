import { Divider, Typography } from 'antd'
import { REPO_URL } from './content.tsx'

const { Text, Link } = Typography

export function Footer() {
  return (
    <footer style={{ padding: '0 16px 40px', textAlign: 'center' }}>
      <Divider />
      <Text type="secondary">
        OwnLedger is free and open source (GPL-3.0).{' '}
        <Link href={REPO_URL} target="_blank" rel="noreferrer">
          Source code on GitHub
        </Link>
      </Text>
    </footer>
  )
}
