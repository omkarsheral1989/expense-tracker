import { Button, Card, Flex, Typography } from 'antd'
import { useState } from 'react'
import { Icon } from '../../../../components/Icon'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { useColorScheme } from '../../../../hooks/useColorScheme'
import type { BalanceMember } from '../../../../services/balancesService/types.ts'
import { groupService } from '../../../../services/groupService'
import { OWED_TO_YOU_COLOR, YOU_OWE_COLOR } from '../../../../theme/balanceColors.ts'
import type { BalanceLine, PersonTotal, SettlePrefill } from '../../types.ts'
import { lineText, prefillOf, summaryOf } from '../../utils.ts'

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
  const owes = totals.some((total) => total.netMinor < 0)
  const getsBack = totals.some((total) => total.netMinor > 0)
  // Green for someone who is only owed, orange-red for someone who only owes; a mix keeps the normal text color.
  const color = getsBack && !owes ? OWED_TO_YOU_COLOR[scheme] : owes && !getsBack ? YOU_OWE_COLOR[scheme] : undefined

  function renderHeading() {
    const content = (
      <Flex align="center" gap={12} style={{ width: '100%' }}>
        <PersonAvatar name={groupService.displayName(member)} picture={member.picture} />
        <Text strong={!settled} type={settled ? 'secondary' : undefined} style={{ flex: 1, minWidth: 0, color, overflowWrap: 'anywhere' }}>
          {summaryOf(member, totals)}
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
        <Button onClick={() => onSettle(prefillOf(member, line))}>Settle up</Button>
      </Flex>
    )
  }

  return (
    <Card>
      {renderHeading()}
      {open && (
        <Flex vertical gap={12} style={{ marginTop: 12 }}>
          {lines.map(renderLine)}
        </Flex>
      )}
    </Card>
  )
}
