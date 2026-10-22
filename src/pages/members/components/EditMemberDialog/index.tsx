import { App, Button, Form, Input } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../components/AdaptiveDialog'
import { getDb } from '../../../../db/client.ts'
import { personService } from '../../../../services/personService'
import type { ManagedPerson, UpdatePersonErrors } from '../../../../services/personService/types.ts'

type Props = {
  /**
   * The person being edited; null while the dialog is closed. The page gives the
   * dialog a new `key` for each opening, so its form starts from what the
   * person has now (a form keeps what was typed in it after it closes).
   */
  person: ManagedPerson | null
  onClose: () => void
  /** The user's person id: they are making the change. */
  userId: string
  /** Called after a change is saved (or the person is gone), so the list is read again. */
  onSaved: () => void
}

type FormValues = { localName: string; email?: string }

/** What `form.setFields` takes for the fields of this dialog. */
function toFormFields(errors: UpdatePersonErrors) {
  return (['localName', 'email'] as const).map((name) => ({
    name,
    errors: errors[name] ? [errors[name]] : [],
  }))
}

/**
 * The edit dialog of the members page. The name is required: the one this device uses
 * for the person; the email shows only while the
 * person is pending, and is the real, shared one. Save with nothing changed
 * just closes.
 */
export function EditMemberDialog({ person, onClose, userId, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const [submitting, setSubmitting] = useState(false)

  async function handleFinish(values: FormValues) {
    if (!person) return
    setSubmitting(true)
    try {
      const result = await personService.updatePerson(await getDb(), userId, person.id, values)
      if ('notFound' in result) {
        message.error('This person is no longer available.')
        onSaved()
        onClose()
        return
      }
      form.setFields(toFormFields(result.ok ? {} : result.errors))
      if (!result.ok) return

      onSaved()
      onClose()
    } catch {
      message.error("Couldn't save the changes. Please try again.")
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
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      </div>
    )
  }

  function renderForm(person: ManagedPerson) {
    return (
      <Form
        // A name of its own, so the fields' ids do not clash with other forms on the page.
        name="editMember"
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ localName: person.localName ?? person.sharedName ?? '', email: person.email ?? '' }}
        onFinish={handleFinish}
        onValuesChange={handleValuesChange}
      >
        <Form.Item
          label="Name"
          name="localName"
          extra="Only you see this name."
          style={person.pending ? undefined : { marginBottom: 0 }}
        >
          <Input autoFocus autoComplete="off" placeholder="For example, Priya Shah" />
        </Form.Item>
        {person.pending && (
          <Form.Item
            label="Email"
            name="email"
            extra={`Only @${personService.memberEmailDomain} addresses. Shared with the group, so they can be sent its Drive folder.`}
            style={{ marginBottom: 0 }}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder={`name@${personService.memberEmailDomain}`}
            />
          </Form.Item>
        )}
      </Form>
    )
  }

  return (
    <AdaptiveDialog open={person !== null} onClose={onClose} title="Edit member" footer={renderFooter()}>
      {person && renderForm(person)}
    </AdaptiveDialog>
  )
}
