import { App, Flex, Select, Typography } from 'antd'
import { useRef } from 'react'
import { groupService } from '../../../../../services/groupService'
import type { KnownPerson } from '../../../../../services/groupService/types.ts'

const { Text } = Typography

type Props = {
  /** Given by the form item, so that its label is tied to the input. */
  id?: string
  /** The signed-in user. They are added automatically, so their own address is ignored. */
  creatorEmail: string
  /** People the user already shares a group with, offered as suggestions. */
  knownPeople: KnownPerson[]
  loading?: boolean
  /** The addresses chosen so far, lower-case. */
  value?: string[]
  onChange?: (emails: string[]) => void
}

/**
 * Pick known people, or type a new address and press Enter. Works as an Ant
 * Design form field whose value is the list of email addresses. Addresses are
 * tidied as they are added (lower-cased, repeats dropped); whether they are
 * Gmail addresses is checked when the form is submitted.
 */
export function MemberSelect({
  id,
  creatorEmail,
  knownPeople,
  loading,
  value,
  onChange,
}: Props) {
  const { message } = App.useApp()
  // The last address typed into the search box, until the next change uses it.
  const lastTyped = useRef('')

  function handleSearch(text: string) {
    if (text.trim() !== '') lastTyped.current = text.trim().toLowerCase()
  }

  function handleChange(typed: string[]) {
    const emails = groupService.normalizeMemberEmails(typed)
    const own = creatorEmail.toLowerCase()

    // Typing an address that is already chosen makes the select drop it, as
    // choosing a ticked option does. That is a repeat, so it is ignored. Removing
    // a tag with its × is a change without typing, and goes through.
    const typedText = lastTyped.current
    lastTyped.current = ''
    const removed = (value ?? []).filter((email) => !emails.includes(email))
    if (removed.length === 1 && removed[0] === typedText) return

    if (emails.includes(own)) {
      message.info('You are added to the group automatically.')
    }
    onChange?.(emails.filter((email) => email !== own))
  }

  return (
    <Select
      id={id}
      mode="tags"
      loading={loading}
      placeholder="Search, or type a Gmail address"
      value={value}
      onChange={handleChange}
      onSearch={handleSearch}
      // Pasting several addresses at once adds each one.
      tokenSeparators={[',', ';', ' ']}
      notFoundContent="Type a Gmail address and press Enter to add it."
      // People can be found by name or by address.
      optionFilterProp="label"
      // A chosen person shows as just their name (or address), not both.
      optionLabelProp="shortLabel"
      options={knownPeople.map(({ email, name }) => ({
        value: email,
        label: name ? `${name} ${email}` : email,
        shortLabel: name ?? email,
        name,
      }))}
      optionRender={({ data }) => (
        <Flex vertical>
          <Text>{data.name ?? data.value}</Text>
          {data.name && <Text type="secondary">{data.value}</Text>}
        </Flex>
      )}
    />
  )
}
