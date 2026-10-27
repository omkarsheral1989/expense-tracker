import { Flex, Typography, theme } from 'antd'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts'
import { RADIUS } from '../../theme/radius.ts'

const { Text } = Typography

/** One slice of a donut. */
export type DonutSlice = {
  id: string
  /** The name shown in the tooltip. */
  label: string
  /** The value that sizes the slice (integer minor units); slices of 0 are not drawn. */
  value: number
  color: string
}

type Props = {
  slices: DonutSlice[]
  /** The words in the hole, above the total ("Shares", "Paid"). */
  label: string
  /** The total, already written ("$500.00"), under the label. */
  total: string
  /** Writes one slice's value for the tooltip ("$300.00"). */
  format: (value: number) => string
}

/** The height of the chart in px: tall enough for a donut and the label in its hole, narrow enough for a phone. */
const CHART_HEIGHT = 220

/** What the tooltip says for the slice under the finger or pointer: its name and amount. */
function SliceTooltip({ active, payload, format }: TooltipContentProps & { format: (value: number) => string }) {
  const { token } = theme.useToken()
  const slice = payload?.[0]?.payload as DonutSlice | undefined
  if (!active || !slice) return null
  return (
    <div style={{ background: token.colorBgElevated, borderRadius: RADIUS.inner, padding: '6px 10px', boxShadow: token.boxShadowSecondary }}>
      <Text strong>{slice.label}</Text> <Text>{format(slice.value)}</Text>
    </div>
  )
}

/**
 * A donut of how a total splits between members (PRD 5.20, ADR-064), drawn with Recharts: the label and the total sit in its hole.
 * The slices are in the order given. The numbers are always also written in the list beside the chart's page, so the tooltip
 * (a tap, on a phone) is a convenience and not the only way to read them.
 */
export function MemberDonut({ slices, label, total, format }: Props) {
  const drawn = slices.filter((slice) => slice.value > 0)

  return (
    <div style={{ position: 'relative', width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Pie
            data={drawn}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={drawn.length > 1 ? 2 : 0}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {drawn.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={(props) => <SliceTooltip {...props} format={format} />} />
        </PieChart>
      </ResponsiveContainer>
      {/* In the hole, over the chart; it lets touches through to the slices. */}
      <Flex vertical align="center" justify="center" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <Text type="secondary">{label}</Text>
        <Text strong style={{ fontSize: 20 }}>
          {total}
        </Text>
      </Flex>
    </div>
  )
}
