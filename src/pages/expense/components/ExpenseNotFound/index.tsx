import { Button, Result } from 'antd'
import { Link } from 'react-router'
import { ROUTES } from '../../../../routes.ts'

type Props = {
  groupId: string
}

/**
 * Shown for an expense that does not exist, was deleted, or is in a group the
 * user does not belong to. All look the same, as for groups.
 */
export function ExpenseNotFound({ groupId }: Props) {
  return (
    <Result
      status="404"
      title="Expense not found"
      subTitle="It may have been deleted, or you may not be a member of its group."
      extra={
        <Link to={ROUTES.group(groupId)}>
          <Button type="primary">Back to the group</Button>
        </Link>
      }
    />
  )
}
