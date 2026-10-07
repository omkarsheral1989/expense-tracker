import { PlusOutlined } from '@ant-design/icons'
import { Button, Empty } from 'antd'

type Props = {
  onCreate: () => void
}

/** What the home page shows before the user has any group. */
export function EmptyGroups({ onCreate }: Props) {
  return (
    <Empty
      style={{ padding: '48px 0' }}
      description="No groups yet. Create one to start sharing expenses."
    >
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        Create group
      </Button>
    </Empty>
  )
}
