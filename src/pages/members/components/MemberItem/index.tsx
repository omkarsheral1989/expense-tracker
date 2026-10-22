import { Card, Flex, Tag, Typography } from 'antd'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { groupService } from '../../../../services/groupService'
import type { ManagedPerson } from '../../../../services/personService/types.ts'

const { Text } = Typography

type Props = {
  person: ManagedPerson
  /** Opens the edit dialog for this person. */
  onEdit: (person: ManagedPerson) => void
}

/**
 * One person on the members page, as a card that opens the edit dialog: an
 * avatar with their initial, the name this device shows for them (their email
 * when no name is known) with the email under it ("No email" without one), and
 * a "Pending" tag until they have signed in and synced (PRD 5.4).
 */
export function MemberItem({ person, onEdit }: Props) {
  const name = person.localName ?? person.sharedName
  const label = groupService.displayName({ name, email: person.email })

  return (
    <Card
      hoverable
      role="button"
      tabIndex={0}
      aria-label={`Edit ${label}`}
      onClick={() => onEdit(person)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit(person)
        }
      }}
      styles={{ body: { padding: 12 } }}
    >
      <Flex align="center" gap={12}>
        <PersonAvatar name={label} picture={person.picture} />
        <Flex vertical flex={1} style={{ minWidth: 0 }}>
          <Text strong ellipsis>
            {label}
          </Text>
          {name && (
            <Text type="secondary" ellipsis>
              {person.email ?? 'No email'}
            </Text>
          )}
        </Flex>
        {person.pending && (
          <Tag variant="filled" style={{ margin: 0 }}>
            Pending
          </Tag>
        )}
      </Flex>
    </Card>
  )
}
