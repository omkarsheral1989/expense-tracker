import { Flex, Typography } from 'antd'
import { PersonAvatar } from '../../../../components/PersonAvatar'
import { CATEGORY_GROUP_COLORS } from '../../../../theme/categoryColors.ts'

const { Text } = Typography

/** The arrow's color: the payment's own, as on its band and in the group's list. */
const ARROW_COLOR = CATEGORY_GROUP_COLORS.settlement

/** Who is on one side of a payment: how they are named, and their picture once known. */
export type PaymentSide = {
  name: string
  picture?: string | null
}

type Props = {
  payer: PaymentSide
  recipient: PaymentSide
  /** The payment as a sentence ("You paid Priya"), for assistive technology. */
  label: string
}

/**
 * Who paid whom, below the band of a payment's page: the payer's avatar and name,
 * an arrow with "paid" under it, and the recipient's avatar and name.
 */
export function PaymentRow({ payer, recipient, label }: Props) {
  function renderSide(side: PaymentSide, align: 'flex-start' | 'flex-end') {
    return (
      <Flex align="center" gap={12} style={{ flex: '0 1 auto', minWidth: 0, justifyContent: align }}>
        <PersonAvatar name={side.name} picture={side.picture} style={{ flex: 'none' }} />
        <Text style={{ overflowWrap: 'anywhere' }}>{side.name}</Text>
      </Flex>
    )
  }

  // A long arrow with "paid" in it, drawn with lines and a head so it stretches between the two people (no icon or font has one that long). Green, like the payment's own color.
  function renderArrow() {
    const line = { flex: 1, minWidth: 8, height: 2, borderRadius: 1, background: ARROW_COLOR }
    return (
      <Flex align="center" gap={8} style={{ flex: '1 1 40px', minWidth: 40 }} aria-hidden>
        <div style={line} />
        <Text type="secondary">paid</Text>
        <Flex align="center" style={{ flex: 1, minWidth: 8 }}>
          <div style={{ ...line, minWidth: 0 }} />
          <div style={{ width: 9, height: 9, marginLeft: -9, borderTop: `2px solid ${ARROW_COLOR}`, borderRight: `2px solid ${ARROW_COLOR}`, transform: 'rotate(45deg)' }} />
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex align="center" gap={24} role="group" aria-label={label} style={{ marginBottom: 20 }}>
      {renderSide(payer, 'flex-start')}
      {renderArrow()}
      {renderSide(recipient, 'flex-end')}
    </Flex>
  )
}
