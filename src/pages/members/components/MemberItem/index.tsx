import { Card, Flex, Tag, Typography } from 'antd'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { groupService } from '../../../../services/groupService'
import type { ManagedPerson } from '../../../../services/personService/types.ts'
import { RADIUS } from '../../../../theme/radius.ts'

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
 * a "Pending" tag until they have signed in and synced (PRD 5.4), or a "You"
 * tag on the user's own card, which is listed first.
 */
export function MemberItem({ person, onEdit }: Props) {
  const name = person.localName ?? person.sharedName
  const label = groupService.displayName({ name, email: person.email })

  return (
    <Card
      hoverable
      // The larger card radius, like the balance rows (PRD 5.9, 5.21).
      style={{ borderRadius: RADIUS.cardLarge }}
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
    >
      <Flex align="center" gap={12}>
        <PersonAvatar name={label} picture={person.picture} />
        <Flex vertical flex={1} style={{ minWidth: 0 }}>
          {/* Two 20 px lines, so the text is as high as the 40 px avatar. */}
          <Text strong ellipsis style={{ lineHeight: '20px' }}>
            {label}
          </Text>
          {name && (
            <Text type="secondary" ellipsis style={{ lineHeight: '20px' }}>
              {person.email ?? 'No email'}
            </Text>
          )}
        </Flex>
        {person.isYou && (
          <Tag variant="filled" style={{ margin: 0 }}>
            You
          </Tag>
        )}
        {person.pending && (
          <Tag variant="filled" style={{ margin: 0 }}>
            Pending
          </Tag>
        )}
      </Flex>
    </Card>
  )
}
