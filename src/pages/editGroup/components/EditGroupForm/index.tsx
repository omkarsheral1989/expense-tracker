import { ArrowLeftOutlined } from '@ant-design/icons'
import { App, Button, Flex, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CurrencySelect } from '../../../../components/CurrencySelect'
import { GroupTypeSelector } from '../../../../components/GroupTypeSelector'
import { getDb } from '../../../../db/client.ts'
import { useLeaveWarning } from '../../../../hooks/useLeaveWarning'
import { ROUTES } from '../../../../routes.ts'
import { groupService } from '../../../../services/groupService'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import type { FormValues } from './types.ts'
import { hasChanges, toFormFields } from './utils.ts'

const { Title } = Typography

type Props = {
  /** The user's person id. */
  userId: string
  group: GroupDetails
}

/** The group's name, type and default currency, filled in with what it has now. */
export function EditGroupForm({ userId, group }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [initialValues] = useState<FormValues>(() => ({
    name: group.name,
    type: group.type,
    defaultCurrency: group.defaultCurrency,
  }))

  const changed = hasChanges(Form.useWatch([], form), initialValues)
  useLeaveWarning(changed)

  const backToGroup = () => navigate(ROUTES.group(group.id))

  function handleLeave() {
    if (!changed) {
      backToGroup()
      return
    }
    modal.confirm({
      title: 'Discard your changes?',
      content: 'What you changed will be lost.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: backToGroup,
    })
  }

  async function handleFinish(values: FormValues) {
    // Nothing to save: Save just closes the page.
    if (!changed) {
      backToGroup()
      return
    }

    setSubmitting(true)
    try {
      const result = await groupService.updateGroup(await getDb(), userId, group.id, values)

      if (!result.ok && result.notFound) {
        message.error('This group is no longer available.')
        navigate(ROUTES.home)
        return
      }

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      message.success('Group updated.')
      backToGroup()
    } catch {
      message.error("Couldn't save the changes. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // A message disappears as soon as its field is edited.
  function handleValuesChange(changedValues: Partial<FormValues>) {
    const fields = Object.keys(changedValues) as (keyof FormValues)[]
    form.setFields(fields.map((name) => ({ name, errors: [] })))
  }

  function renderHeader() {
    return (
      <Flex align="center" gap={8} style={{ marginBottom: 24 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back" onClick={handleLeave} />
        <Title level={3} style={{ margin: 0 }}>
          Edit group
        </Title>
      </Flex>
    )
  }

  function renderFields() {
    return (
      <>
        <Form.Item label="Group name" name="name">
          <Input autoFocus placeholder="For example, Goa trip" />
        </Form.Item>
        <Form.Item label="Type" name="type">
          <GroupTypeSelector />
        </Form.Item>
        <Form.Item
          label="Default currency"
          name="defaultCurrency"
          extra="New expenses start with this currency. Existing expenses keep theirs."
        >
          <CurrencySelect firstCode={group.defaultCurrency} />
        </Form.Item>
      </>
    )
  }

  function renderActions() {
    return (
      <Flex justify="flex-end" gap={8}>
        <Button onClick={handleLeave}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={submitting}>
          Save
        </Button>
      </Flex>
    )
  }

  return (
    <>
      {renderHeader()}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={initialValues}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        {renderFields()}
        {renderActions()}
      </Form>
    </>
  )
}
