import { Button, Card, Flex, Typography } from 'antd'
import { useState } from 'react'
import { Icon } from '../../../../components/Icon'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { useColorScheme } from '../../../../hooks/useColorScheme'
import type { BalanceMember } from '../../../../services/balancesService/types.ts'
import { groupService } from '../../../../services/groupService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../theme/balanceColors.ts'
import { PILL_RADIUS, RADIUS } from '../../../../theme/radius.ts'
import type { BalanceLine, PersonTotal, SettlePrefill } from '../../types.ts'
import { lineText, prefillOf, summarySegments, type SummarySegment } from '../../utils.ts'

const { Text } = Typography

type Props = {
  member: BalanceMember
  totals: PersonTotal[]
  lines: BalanceLine[]
  /** Everyone in the group, to name the other person on each line. */
  members: ReadonlyMap<string, BalanceMember>
  onSettle: (prefill: SettlePrefill) => void
}

/**
 * One member's row: their avatar and what they are owed or owe in total. A row with something owed opens to the payments that
 * settle it, each with a Settle up button; a settled-up member's row only says so.
 */
export function BalanceRow({ member, totals, lines, members, onSettle }: Props) {
  const scheme = useColorScheme()
  const [open, setOpen] = useState(false)
  const settled = totals.length === 0
  const toneColor = { owed: OWED_TO_YOU_COLOR[scheme], owes: YOU_OWE_COLOR[scheme] }

  // Only the amounts are colored: green when owed to them, orange-red when they owe.
  function renderSegment(segment: SummarySegment, index: number) {
    if (typeof segment === 'string') return segment
    return (
      <Text key={index} strong style={{ color: toneColor[segment.tone] }}>
        {segment.amount}
      </Text>
    )
  }

  function renderHeading() {
    const content = (
      <Flex align="center" gap={12} style={{ width: '100%' }}>
        <PersonAvatar name={groupService.displayName(member)} picture={member.picture} />
        <Text type={settled ? 'secondary' : undefined} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {summarySegments(member, totals).map(renderSegment)}
        </Text>
        {!settled && <Icon name={open ? 'chevronDown' : 'chevronRight'} />}
      </Flex>
    )
    if (settled) return content
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
      >
        {content}
      </button>
    )
  }

  function renderLine(line: BalanceLine) {
    const other = members.get(line.otherId)
    if (!other) return null
    return (
      <Flex key={`${line.currency}|${line.kind}|${line.otherId}`} align="center" justify="space-between" gap={12}>
        <Text style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{lineText(member, other, line)}</Text>
        <Button onClick={() => onSettle(prefillOf(member, line))} style={{ borderRadius: PILL_RADIUS }}>
          Settle up
        </Button>
      </Flex>
    )
  }

  return (
    // The larger card radius (PRD 5.21); the card keeps its border and padding from the theme.
    <Card style={{ borderRadius: RADIUS.cardLarge }}>
      {renderHeading()}
      {/* Always in the page and folded shut with a height transition (`.balance-lines`); inert while shut, so it cannot be focused. */}
      <div className="balance-lines" data-open={open}>
        <div inert={!open}>
          <Flex vertical gap={12} style={{ paddingTop: 12 }}>
            {lines.map(renderLine)}
          </Flex>
        </div>
      </div>
    </Card>
  )
}
