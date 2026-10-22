import { CheckOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Divider, Flex, Input, theme, Typography } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import { PersonAvatar } from '../../../../../../components/PersonAvatar'
import { AddMemberDialog } from '../../../../../../components/MemberSelect/AddMemberDialog'
import { groupService } from '../../../../../../services/groupService'
import type { KnownPerson } from '../../../../../../services/personService/types.ts'
import { ICON_ONLY_SIZE } from '../../../../../../theme/controlHeight.ts'

const { Text } = Typography

type Props = {
  open: boolean
  onClose: () => void
  /** The people saved on this device who are not in the group, to pick from. */
  people: KnownPerson[]
  loading: boolean
  /** Called with the people ticked, when the user presses Add. */
  onAdd: (people: KnownPerson[]) => void
  /** The people are being added: Add shows it is working. */
  adding: boolean
  /** The user's person id: they are the one adding someone new. */
  adderId: string
  /**
   * Called with someone just saved on this device through "Add a new member",
   * so the parent puts them in `people`. They are saved at once, but only join
   * the group when the user presses Add, like anyone else ticked.
   */
  onPersonSaved: (person: KnownPerson) => void
}

/**
 * "Add a member": a search box and the people saved on this device who are not
 * in the group yet, each ticked with a tap, and "Add a new member" under the
 * list for someone who is not saved yet (who then appears in the list, already
 * ticked). Cancel closes it; Add (switched off until someone is ticked) adds
 * the ticked people to the group. A centered
 * dialog on wide screens and a bottom sheet on phones. It starts empty each time
 * it opens, so the parent gives it a new `key` for every opening.
 */
export function PickMemberDialog({ open, onClose, people, loading, onAdd, adding, adderId, onPersonSaved }: Props) {
  const { token } = theme.useToken()
  const [search, setSearch] = useState('')
  const [ticked, setTicked] = useState<string[]>([])
  const [newPersonOpen, setNewPersonOpen] = useState(false)

  // People can be found by name or by address.
  const query = search.trim().toLowerCase()
  const shown = people.filter((person) =>
    [person.name, person.email].some((text) => text?.toLowerCase().includes(query)),
  )

  function handlePersonSaved(person: KnownPerson) {
    onPersonSaved(person)
    // Listed and ticked, ready for Add; the search is cleared so they are in view.
    setTicked((current) => [...current, person.id])
    setSearch('')
  }

  function toggle(person: KnownPerson) {
    setTicked((current) =>
      current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
    )
  }

  function renderPerson(person: KnownPerson) {
    const label = groupService.displayName(person)
    const isTicked = ticked.includes(person.id)
    return (
      <Button
        key={person.id}
        type="text"
        block
        aria-pressed={isTicked}
        onClick={() => toggle(person)}
        style={{ height: 'auto', padding: '8px 4px', justifyContent: 'flex-start' }}
      >
        <Flex align="center" gap={12} style={{ minWidth: 0 }}>
          <PersonAvatar name={label} picture={person.picture} style={{ flex: 'none' }} />
          <Flex vertical align="flex-start" style={{ minWidth: 0 }}>
            <Text strong ellipsis>
              {label}
            </Text>
            {person.name && (
              <Text type="secondary" ellipsis>
                {person.email ?? 'No email'}
              </Text>
            )}
          </Flex>
        </Flex>
        {isTicked && <CheckOutlined style={{ marginInlineStart: 'auto', color: token.colorPrimary, fontSize: ICON_ONLY_SIZE }} />}
      </Button>
    )
  }

  function renderPeople() {
    if (loading) return null
    if (shown.length === 0) {
      return (
        <Text type="secondary" style={{ padding: '8px 4px' }}>
          {people.length === 0 ? 'Everyone you know is already in this group.' : 'No one matches.'}
        </Text>
      )
    }
    return shown.map(renderPerson)
  }

  function renderFooter() {
    return (
      <Flex justify="flex-end" gap={8}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          disabled={ticked.length === 0}
          loading={adding}
          onClick={() => onAdd(people.filter((person) => ticked.includes(person.id)))}
        >
          Add
        </Button>
      </Flex>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={onClose} title="Add a member" footer={renderFooter()}>
      <Flex vertical gap={8}>
        <Input
          aria-label="Search people"
          placeholder="Search people"
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Flex vertical role="list" aria-label="People you know">
          {renderPeople()}
        </Flex>
        <Divider style={{ margin: 0 }} />
        <Button type="text" block icon={<PlusOutlined />} onClick={() => setNewPersonOpen(true)} style={{ justifyContent: 'flex-start' }}>
          Add a new member
        </Button>
      </Flex>
      {/* Inside the sheet in the component tree (it is drawn on the page, not in
          the sheet), so the sheet is pushed up when this one opens, like the
          Members sheet is when this sheet opens. */}
      <AddMemberDialog
        open={newPersonOpen}
        onClose={() => setNewPersonOpen(false)}
        adderId={adderId}
        onAdded={handlePersonSaved}
      />
    </AdaptiveDialog>
  )
}
