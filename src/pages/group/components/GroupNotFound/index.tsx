import { Button, Result } from 'antd'
import { Link } from 'react-router'
import { ROUTES } from '../../../../routes.ts'

/**
 * Shown for a group that does not exist, was deleted, or that the user does not
 * belong to. The three look the same on purpose, so the page does not reveal
 * whether a group exists.
 */
export function GroupNotFound() {
  return (
    <Result
      status="404"
      title="Group not found"
      subTitle="It may have been deleted, or you may not be a member of it."
      extra={
        <Link to={ROUTES.home}>
          <Button type="primary">Back to your groups</Button>
        </Link>
      }
    />
  )
}
