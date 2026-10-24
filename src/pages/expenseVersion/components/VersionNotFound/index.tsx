import { Button, Result } from 'antd'
import { AppLink } from '../../../../components/AppLink'
import { ROUTES } from '../../../../routes.ts'

type Props = {
  groupId: string
  expenseId: string
}

/**
 * Shown for a version that does not exist, belongs to another expense, or is in
 * a group the user does not belong to. All look the same, as for groups.
 */
export function VersionNotFound({ groupId, expenseId }: Props) {
  return (
    <Result
      status="404"
      title="Version not found"
      subTitle="It may have been removed, or you may not be a member of its group."
      extra={
        <AppLink direction="back" to={ROUTES.expense(groupId, expenseId)}>
          <Button type="primary">Back to the expense</Button>
        </AppLink>
      }
    />
  )
}
