import { Flex, Typography } from 'antd'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { moneyService } from '../../../../services/moneyService'
import type { TotalsRow } from '../../../../services/totalsService/types.ts'
import { percentOf } from '../../../../services/totalsService/utils.ts'
import { rowName } from '../../utils.ts'

const { Text } = Typography

type Props = {
  /** What the list is of ("Shares", "Paid"): its accessible name. */
  label: string
  rows: TotalsRow[]
  currency: string
  totalMinor: number
  /** The color of each member, as in the donut above. */
  colors: ReadonlyMap<string, string>
}

/**
 * The text version of a donut (PRD 5.20): one row per member with their color, avatar, name, amount and percent of the total. A
 * member with nothing has a row too, with no slice in the chart.
 */
export function ShareList({ label, rows, currency, totalMinor, colors }: Props) {
  function renderRow(row: TotalsRow) {
    return (
      <Flex key={row.personId} role="listitem" align="center" gap={10} style={{ minHeight: 44 }}>
        <span aria-hidden style={{ flex: 'none', width: 16, height: 16, borderRadius: '50%', background: colors.get(row.personId) }} />
        <PersonAvatar name={rowName(row)} picture={row.picture} size={32} />
        <Text style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{rowName(row)}</Text>
        <Text strong>{moneyService.format(row.amountMinor, currency)}</Text>
        <Text type="secondary" style={{ flex: 'none', width: 44, textAlign: 'right' }}>
          {percentOf(row.amountMinor, totalMinor)}%
        </Text>
      </Flex>
    )
  }

  return (
    <Flex vertical role="list" aria-label={label}>
      {rows.map(renderRow)}
    </Flex>
  )
}
