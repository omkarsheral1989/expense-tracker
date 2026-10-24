import { Divider, Flex, Typography } from 'antd'
import type { SplitMethod } from '../../db/types.ts'
import { dateService } from '../../services/dateService'
import { expenseService } from '../../services/expenseService'
import type { ExpenseShareDetails } from '../../services/expenseService/types.ts'
import { moneyService } from '../../services/moneyService'
import { CategoryIcon } from '../CategoryIcon'
import { PersonAvatar } from '../PersonAvatar'
import { displayName, owedSentence, paidSentence, SPLIT_METHOD_LABELS } from '../ExpenseWording'
import { ReceiptGallery } from '../ReceiptGallery'

const { Paragraph, Text, Title } = Typography

type Props = {
  description: string
  category: string
  amountMinor: number
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  notes: string | null
  method: SplitMethod
  /** The viewer first, then the others; the people who paid or owe something. */
  shares: ExpenseShareDetails[]
  receipts: { id: string; mimeType: string }[]
  /** Names the device's photo store, which holds the receipts. */
  datasetId: string
  /**
   * True when the page shows the summary itself (the expense page draws it on its colored band);
   * only the split, notes and receipts are then drawn. False (the default) draws the summary too.
   */
  withoutSummary?: boolean
}

/**
 * An expense as the details page and the version page show it: its category
 * tile, title, amount, category and day, who paid, how it was split and what
 * each person owes, its notes and its receipt photos. A payment is titled by
 * who paid whom and has no payer line or split.
 */
export function ExpenseBody({
  description,
  category,
  amountMinor,
  currency,
  date,
  notes,
  method,
  shares,
  receipts,
  datasetId,
  withoutSummary = false,
}: Props) {
  const categoryOf = expenseService.categoryOf(category)
  // A settlement is worded by who paid whom ("You paid Priya"), and has no split to show.
  const isSettlement = category === expenseService.settlementCategory

  // A settlement's title already says who paid whom.
  function renderPayers() {
    if (isSettlement) return null
    return shares
      .filter((share) => share.paidMinor > 0)
      .map((share) => (
        <Text key={share.personId} type="secondary">
          {paidSentence(share, currency)}
        </Text>
      ))
  }

  function renderSummary() {
    return (
      <Flex align="flex-start" gap={16}>
        <CategoryIcon category={category} size={48} />
        <Flex vertical style={{ minWidth: 0 }}>
          <Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {expenseService.titleOf({ category, description, shares })}
          </Title>
          <Text style={{ fontSize: 28, fontWeight: 600 }}>{moneyService.format(amountMinor, currency)}</Text>
          <Text type="secondary">
            {categoryOf.label === 'Other' ? `${categoryOf.groupLabel}: Other` : categoryOf.label} ·{' '}
            {dateService.formatDay(date, dateService.toDay(new Date()))}
          </Text>
          {renderPayers()}
        </Flex>
      </Flex>
    )
  }

  function renderShare(share: ExpenseShareDetails) {
    const name = displayName(share)
    return (
      <Flex key={share.personId} align="center" gap={12} role="listitem">
        <PersonAvatar name={name} picture={share.picture} style={{ flex: 'none' }} />
        <Text style={{ overflowWrap: 'anywhere' }}>{owedSentence(share, currency)}</Text>
      </Flex>
    )
  }

  // On the expense page, where the band holds no payer line, who paid sits above the split like its rows (a payment has no split section, so no rows).
  function renderPayerRows() {
    if (!withoutSummary) return null
    return (
      <Flex vertical gap={12} role="list" aria-label="Who paid" style={{ marginBottom: 20 }}>
        {shares
          .filter((share) => share.paidMinor > 0)
          .map((share) => (
            <Flex key={share.personId} align="center" gap={12} role="listitem">
              <PersonAvatar name={displayName(share)} picture={share.picture} style={{ flex: 'none' }} />
              <Text style={{ overflowWrap: 'anywhere' }}>{paidSentence(share, currency)}</Text>
            </Flex>
          ))}
      </Flex>
    )
  }

  function renderSplit() {
    if (isSettlement) return null
    return (
      <>
        {withoutSummary ? null : <Divider style={{ margin: '16px 0' }} />}
        {renderPayerRows()}
        <Text strong>{SPLIT_METHOD_LABELS[method]}</Text>
        <Flex vertical gap={12} role="list" aria-label="Who owes" style={{ marginTop: 12 }}>
          {shares.filter((share) => share.owedMinor > 0).map(renderShare)}
        </Flex>
      </>
    )
  }

  function renderNotes() {
    if (!notes) return null
    return (
      <>
        <Divider style={{ margin: '16px 0' }} />
        <Text strong>Notes</Text>
        <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', overflowWrap: 'anywhere' }}>{notes}</Paragraph>
      </>
    )
  }

  function renderReceipts() {
    if (receipts.length === 0) return null
    return (
      <>
        <Divider style={{ margin: '16px 0' }} />
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          Receipts
        </Text>
        <ReceiptGallery receipts={receipts} datasetId={datasetId} />
      </>
    )
  }

  return (
    <>
      {withoutSummary ? null : renderSummary()}
      {renderSplit()}
      {renderNotes()}
      {renderReceipts()}
    </>
  )
}
