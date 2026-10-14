import { App, Button, Form, Input } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import { getDb } from '../../../../../../db/client.ts'
import { personService } from '../../../../../../services/personService'
import type { AddPersonErrors, KnownPerson } from '../../../../../../services/personService/types.ts'

type Props = {
  open: boolean
  onClose: () => void
  /** The user's person id: they are adding the person. */
  adderId: string
  /** Called with the person once they are saved on this device. */
  onAdded: (person: KnownPerson) => void
}

type FormValues = { name: string; email?: string }

/** What `form.setFields` takes for the fields of this dialog. */
function toFormFields(errors: AddPersonErrors) {
  return (['name', 'email'] as const).map((name) => ({
    name,
    errors: errors[name] ? [errors[name]] : [],
  }))
}

/**
 * The "Add a new member" dialog: a name, and optionally a Gmail address. Add
 * saves the person on this device at once (so they are listed for every group)
 * and hands them back; problems are shown beside their field.
 */
export function AddMemberDialog({ open, onClose, adderId, onAdded }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const [submitting, setSubmitting] = useState(false)

  function handleClose() {
    form.resetFields()
    onClose()
  }

  async function handleFinish(values: FormValues) {
    setSubmitting(true)
    try {
      const result = await personService.addPerson(await getDb(), adderId, values)
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      onAdded(result.person)
      handleClose()
    } catch {
      message.error("Couldn't add the member. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // A message disappears as soon as its field is edited.
  function handleValuesChange(changed: Partial<FormValues>) {
    const fields = Object.keys(changed) as (keyof FormValues)[]
    form.setFields(fields.map((name) => ({ name, errors: [] })))
  }

  function renderFooter() {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Add
        </Button>
      </div>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={handleClose} title="Add a new member" footer={renderFooter()}>
      <Form
        // A name of its own, so its fields' ids do not clash with the group form's "name".
        name="addMember"
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        <Form.Item label="Name" name="name">
          <Input autoFocus autoComplete="off" placeholder="For example, Priya Shah" />
        </Form.Item>
        <Form.Item
          label="Email (optional)"
          name="email"
          extra={`Only @${personService.memberEmailDomain} addresses. Needed later to share the group through Google Drive.`}
          style={{ marginBottom: 0 }}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder={`name@${personService.memberEmailDomain}`}
          />
        </Form.Item>
      </Form>
    </AdaptiveDialog>
  )
}
