import { PlusOutlined } from '@ant-design/icons'
import { Button, Divider, Flex, Select, Typography } from 'antd'
import { useState } from 'react'
import { groupService } from '../../../../../services/groupService'
import type { KnownPerson } from '../../../../../services/personService/types.ts'
import { AddMemberDialog } from './AddMemberDialog'

const { Text } = Typography

type Props = {
  /** Given by the form item, so that its label is tied to the input. */
  id?: string
  /** The user's person id: they are adding anyone new. */
  adderId: string
  /** The people saved on this device, offered to pick from. */
  knownPeople: KnownPerson[]
  loading?: boolean
  /** Called with a person who has just been saved in the dialog, to add them to `knownPeople`. */
  onPersonAdded: (person: KnownPerson) => void
  /** The ids of the people chosen so far. */
  value?: string[]
  onChange?: (ids: string[]) => void
}

/**
 * Pick people already saved on this device; typing only searches them. The
 * last row of the list, "Add a new member", opens a dialog that saves someone
 * new and chooses them. Works as an Ant Design form field whose value is the
 * list of chosen people's ids.
 */
export function MemberSelect({
  id,
  adderId,
  knownPeople,
  loading,
  onPersonAdded,
  value = [],
  onChange,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Held here so the list can be closed when the dialog opens over it.
  const [listOpen, setListOpen] = useState(false)

  function handleAdded(person: KnownPerson) {
    onPersonAdded(person)
    onChange?.([...value, person.id])
  }

  function openDialog() {
    setListOpen(false)
    setDialogOpen(true)
  }

  function renderAddRow(menu: React.ReactElement) {
    return (
      <>
        {menu}
        <Divider style={{ margin: 0 }} />
        <Button type="text" block icon={<PlusOutlined />} onClick={openDialog} style={{ justifyContent: 'flex-start', borderRadius: 0 }}>
          Add a new member
        </Button>
      </>
    )
  }

  return (
    <>
      <Select
        id={id}
        mode="multiple"
        open={listOpen}
        onOpenChange={setListOpen}
        loading={loading}
        placeholder="Search people"
        value={value}
        onChange={onChange}
        notFoundContent="No one matches."
        // People can be found by name or by address.
        optionFilterProp="label"
        // A chosen person shows as just their name (or address), not both.
        optionLabelProp="shortLabel"
        popupRender={renderAddRow}
        options={knownPeople.map((person) => ({
          value: person.id,
          label: [person.name, person.email].filter(Boolean).join(' '),
          shortLabel: groupService.displayName(person),
          person,
        }))}
        optionRender={({ data }) => (
          <Flex vertical>
            <Text>{data.shortLabel}</Text>
            {data.person.name && <Text type="secondary">{data.person.email ?? 'No email'}</Text>}
          </Flex>
        )}
      />
      <AddMemberDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        adderId={adderId}
        onAdded={handleAdded}
      />
    </>
  )
}
