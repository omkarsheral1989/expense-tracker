import { App, Button, Flex, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useAppNavigate } from '../../../../hooks/useAppNavigate'
import { getDb } from '../../../../db/client.ts'
import { useKnownPeople } from '../../../../hooks/useKnownPeople'
import { useLeaveWarning } from '../../../../hooks/useLeaveWarning'
import { ROUTES } from '../../../../routes.ts'
import { currencyService } from '../../../../services/currencyService'
import { groupService } from '../../../../services/groupService'
import { DEFAULT_GROUP_TYPE } from './constants.ts'
import { CurrencySelect } from '../../../../components/CurrencySelect'
import { GroupTypeBackground } from '../../../../components/GroupTypeBackground'
import { GroupTypeSelector } from '../../../../components/GroupTypeSelector'
import { MemberSelect } from '../../../../components/MemberSelect'
import type { FormValues } from './types.ts'
import { hasUnsavedInput, toFormFields } from './utils.ts'
import { HEADER_TITLE_STYLE } from '../../../../theme/headerTitle.ts'
import { BackButton } from '../../../../components/BackButton'

const { Title, Text } = Typography

type Props = {
  /** The user's person id: they become the first member. */
  creatorId: string
}

export function CreateGroupForm({ creatorId }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message, modal } = App.useApp()
  const navigate = useAppNavigate()
  const [submitting, setSubmitting] = useState(false)
  const { people, loading, add: addKnownPerson } = useKnownPeople(creatorId)

  // The currency of the device's region, preselected and listed first.
  const [regionCurrency] = useState(() =>
    currencyService.forLocales(navigator.languages),
  )
  const [initialValues] = useState<FormValues>(() => ({
    name: '',
    type: DEFAULT_GROUP_TYPE,
    defaultCurrency: regionCurrency ?? undefined,
    memberIds: [],
  }))

  const hasInput = hasUnsavedInput(Form.useWatch([], form), initialValues)
  const type = Form.useWatch('type', form)
  useLeaveWarning(hasInput)

  function handleLeave() {
    if (!hasInput) {
      navigate(ROUTES.home, { direction: 'back' })
      return
    }
    modal.confirm({
      title: 'Discard this group?',
      content: 'What you entered will be lost.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: () => navigate(ROUTES.home, { direction: 'back' }),
    })
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await groupService.createGroup(await getDb(), creatorId, {
        ...values,
        defaultCurrency: values.defaultCurrency ?? '',
      })

      // Every problem is shown at once, each beside its own field.
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      message.success('Group created.')
      // The new group takes Create group's place in the history, so Back from it goes to the list, not to the form again.
      navigate(ROUTES.group(result.groupId), { replace: true, direction: 'forward' })
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
      // Comes in from the top when the page opens from the list's Create group button (PRD 5.16).
      <Flex align="center" gap={8} data-vt="header" style={{ marginBottom: 24 }}>
        <BackButton onClick={handleLeave} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Create a group
        </Title>
      </Flex>
    )
  }

  function renderFields() {
    return (
      <>
        <Form.Item label="Group name" name="name">
          <Input placeholder="For example, Goa trip" />
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
          name="memberIds"
          extra={<Text type="secondary">You are added automatically.</Text>}
        >
          <MemberSelect
            adderId={creatorId}
            knownPeople={people}
            loading={loading}
            onPersonAdded={addKnownPerson}
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
    <>
      <GroupTypeBackground type={type} />
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
