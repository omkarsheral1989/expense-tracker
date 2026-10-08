import { ArrowLeftOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getDb } from '../../../../db/client.ts'
import { useKnownPeople } from '../../../../hooks/useKnownPeople'
import { useLeaveWarning } from '../../../../hooks/useLeaveWarning'
import { ROUTES } from '../../../../routes.ts'
import { currencyService } from '../../../../services/currencyService'
import { groupService } from '../../../../services/groupService'
import type { Creator } from '../../../../services/groupService/types.ts'
import { DEFAULT_GROUP_TYPE } from './constants.ts'
import { CurrencySelect } from './CurrencySelect'
import { GroupTypeSelector } from './GroupTypeSelector'
import { MemberSelect } from './MemberSelect'
import type { FormValues } from './types.ts'
import { hasUnsavedInput, toFormFields } from './utils.ts'

const { Title, Text } = Typography

type Props = {
  /** The signed-in user, who becomes the first member. */
  creator: Creator
}

export function CreateGroupForm({ creator }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const { people, loading } = useKnownPeople(creator.email)

  // The currency of the device's region, preselected and listed first.
  const [regionCurrency] = useState(() =>
    currencyService.forLocales(navigator.languages),
  )
  const [initialValues] = useState<FormValues>(() => ({
    name: '',
    type: DEFAULT_GROUP_TYPE,
    defaultCurrency: regionCurrency ?? undefined,
    memberEmails: [],
  }))

  const hasInput = hasUnsavedInput(Form.useWatch([], form), initialValues)
  useLeaveWarning(hasInput)

  function handleLeave() {
    if (!hasInput) {
      navigate(ROUTES.home)
      return
    }
    modal.confirm({
      title: 'Discard this group?',
      content: 'What you entered will be lost.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: () => navigate(ROUTES.home),
    })
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await groupService.createGroup(await getDb(), creator, {
        ...values,
        defaultCurrency: values.defaultCurrency ?? '',
      })

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      message.success('Group created.')
      navigate(ROUTES.group(result.groupId))
    } catch {
      message.error("Couldn't create the group. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // A message disappears as soon as its field is edited.
  function handleValuesChange(changed: Partial<FormValues>) {
    const fields = Object.keys(changed) as (keyof FormValues)[]
    form.setFields(fields.map((name) => ({ name, errors: [] })))
  }

  function renderHeader() {
    return (
      <Flex align="center" gap={8} style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          aria-label="Back"
          onClick={handleLeave}
        />
        <Title level={3} style={{ margin: 0 }}>
          Create a group
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
          extra="New expenses start with this currency. Each expense can use another."
        >
          <CurrencySelect firstCode={regionCurrency} />
        </Form.Item>
        <Form.Item
          label="Members"
          name="memberEmails"
          extra={
            <Text type="secondary">
              You are added automatically. Only @{groupService.memberEmailDomain}{' '}
              addresses can be added.
            </Text>
          }
        >
          <MemberSelect
            creatorEmail={creator.email}
            knownPeople={people}
            loading={loading}
          />
        </Form.Item>
      </>
    )
  }

  function renderActions() {
    return (
      <Flex justify="flex-end" gap={8}>
        <Button onClick={handleLeave}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={submitting}>
          Create group
        </Button>
      </Flex>
    )
  }

  return (
    <Card>
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
    </Card>
  )
}
