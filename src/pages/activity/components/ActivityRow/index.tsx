import { Flex, Typography, theme } from 'antd'
import { AppLink } from '../../../../components/AppLink'
import { CategoryIcon } from '../../../../components/CategoryIcon'
import { historyLines } from '../../../../components/ExpenseWording'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { UnreadDot } from '../../../../components/UnreadDot'
import { ROUTES } from '../../../../routes.ts'
import type { ActivityItem } from '../../../../services/activityService/types.ts'
import { dateService } from '../../../../services/dateService'
import { groupService } from '../../../../services/groupService'
import { RADIUS } from '../../../../theme/radius.ts'
import { activityDetail, activitySentence } from '../../utils.ts'
import { ACTIVITY_FROM } from '../../constants.ts'

const { Text } = Typography

/** Size of the category tile, and of the actor's badge on its corner. */
const TILE_SIZE = 40
const BADGE_SIZE = 20

type Props = {
  item: ActivityItem
  /** Another member's event the user has not seen: a faint green wash and a dot. */
  isNew: boolean
}

/**
 * One event of the Activity feed (PRD 5.18): the category tile with the actor's
 * badge, the sentence, what the event changed, the group and amount, and the time.
 * The whole row opens the version it holds.
 */
export function ActivityRow({ item, isNew }: Props) {
  const { token } = theme.useToken()
  const lines = historyLines(item.entry, item.people)

  function renderLine(line: (typeof lines)[number], index: number) {
    return (
      <li key={index}>
        {line.text}
        {line.nested && (
          <ul style={{ margin: '2px 0 0', paddingInlineStart: 20, listStyleType: 'circle' }}>
            {line.nested.map((text, nestedIndex) => (
              <li key={nestedIndex}>{text}</li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  function renderTile() {
    return (
      <div style={{ position: 'relative', flex: 'none', width: TILE_SIZE, height: TILE_SIZE }}>
        <CategoryIcon category={item.category} size={TILE_SIZE} />
        <PersonAvatar
          name={groupService.shortName(item.by)}
          picture={item.by.picture}
          size={BADGE_SIZE}
          style={{ position: 'absolute', right: -4, bottom: -4, boxShadow: `0 0 0 2px ${token.colorBgLayout}`, fontSize: 11 }}
        />
      </div>
    )
  }

  return (
    <div role="listitem">
      <AppLink
        to={ROUTES.expenseVersion(item.groupId, item.expenseId, item.id)}
        state={{ from: ACTIVITY_FROM }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 8px',
          borderRadius: RADIUS.inner,
          color: 'inherit',
          background: isNew ? `color-mix(in srgb, ${token.colorPrimary} 10%, transparent)` : undefined,
        }}
      >
        {renderTile()}
        <Flex vertical gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ overflowWrap: 'anywhere' }}>
            {isNew && <UnreadDot style={{ marginRight: 6, verticalAlign: 'middle' }} />}
            {activitySentence(item)}
          </Text>
          <Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
            {activityDetail(item)}
          </Text>
          {lines.length > 0 && <ul style={{ margin: '2px 0 0', paddingInlineStart: 20, overflowWrap: 'anywhere' }}>{lines.map(renderLine)}</ul>}
        </Flex>
        <Text type="secondary" style={{ flex: 'none', maxWidth: 96, fontSize: 12, textAlign: 'right' }}>
          {dateService.formatDateTime(item.entry.at, navigator.language)}
        </Text>
      </AppLink>
    </div>
  )
}
