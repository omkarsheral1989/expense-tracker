import { Divider, Typography } from 'antd'
import { REPO_URL } from '../../constants.ts'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'

const { Text, Link } = Typography

export function Footer() {
  return (
    <footer style={{ padding: `0 16px ${aboveScreenEdge(40)}`, textAlign: 'center' }}>
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
