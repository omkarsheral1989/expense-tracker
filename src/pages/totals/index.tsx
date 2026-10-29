import { Divider, Flex, Select, Typography } from 'antd'
import { useState } from 'react'
import { useParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { GroupNotFound } from '../../components/GroupNotFound'
import { LoadError } from '../../components/LoadError'
import { LoadingMessage } from '../../components/LoadingMessage'
import { MemberDonut } from '../../components/MemberDonut'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import { currencyService } from '../../services/currencyService'
import { moneyService } from '../../services/moneyService'
import type { CurrencyTotals, GroupTotals, TotalsRow } from '../../services/totalsService/types.ts'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { ShareList } from './components/ShareList'
import { colorsOf, loadTotals, rowName, TOTALS_PAGE, totalsKey } from './utils.ts'

const { Text, Title } = Typography

/** A column about 560 px wide, centered, like the settle-up page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(24)}` } as const

/**
 * What a group has spent and how it splits (PRD 5.20): the total, then a donut of what each member owes and one of what each paid,
 * each with its list, for one currency at a time.
 */
export function TotalsPage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  const { id = '' } = useParams()
  const userId = user?.personId ?? ''
  const [chosen, setChosen] = useState<string | null>(null)

  const { state, retry } = useCachedData(() => loadTotals(userId, id), TOTALS_PAGE, totalsKey(userId, id))

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderHeader() {
    return (
      <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
        <BackButton onClick={() => navigate(ROUTES.group(id), { direction: 'back' })} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Totals
        </Title>
      </Flex>
    )
  }

  function renderCurrencySelect(totals: GroupTotals, current: CurrencyTotals) {
    if (totals.currencies.length < 2) return null
    return (
      <Flex vertical gap={4}>
        <Text type="secondary">Select the currency for the breakdown</Text>
        <Select
          aria-label="Currency"
          style={{ width: '100%' }}
          value={current.currency}
          onChange={setChosen}
          options={totals.currencies.map(({ currency }) => ({ value: currency, label: currencyService.label(currency, navigator.language) }))}
        />
      </Flex>
    )
  }

  /** What the group spent in every currency, the group's default first, all the same size; nothing is converted. */
  function renderTotalSpent(totals: GroupTotals) {
    function renderAmount(one: CurrencyTotals) {
      return (
        <Text key={one.currency} strong style={{ fontSize: 24, lineHeight: '32px' }}>
          {moneyService.format(one.totalMinor, one.currency)}
        </Text>
      )
    }
    return (
      <>
        <Flex vertical>
          <Text type="secondary">Total spent</Text>
          {totals.currencies.map(renderAmount)}
        </Flex>
        {/* The sections below start 24 px under whatever is above them, so the line has no room of its own below when no dropdown follows. */}
        <Divider style={{ margin: totals.currencies.length > 1 ? '16px 0 24px' : '16px 0 0' }} />
      </>
    )
  }

  function renderSplit(heading: string, label: string, rows: TotalsRow[], current: CurrencyTotals, colors: ReadonlyMap<string, string>) {
    const format = (minor: number) => moneyService.format(minor, current.currency)
    return (
      <Flex vertical gap={8} style={{ marginTop: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          {heading}
        </Title>
        <MemberDonut
          label={label}
          total={format(current.totalMinor)}
          format={format}
          slices={rows.map((row) => ({ id: row.personId, label: rowName(row), value: row.amountMinor, color: colors.get(row.personId) ?? '#999' }))}
        />
        <ShareList label={label} rows={rows} currency={current.currency} totalMinor={current.totalMinor} colors={colors} />
      </Flex>
    )
  }

  function renderTotals(totals: GroupTotals) {
    const current = totals.currencies.find((one) => one.currency === chosen) ?? totals.currencies[0]
    // The group has nothing that counts: the pill that leads here is switched off, so only a direct link gets here.
    if (!current) {
      return (
        <Flex vertical style={COLUMN_STYLE}>
          <title>Totals · OwnLedger</title>
          {renderHeader()}
          <Text type="secondary">No expenses yet</Text>
        </Flex>
      )
    }
    const colors = colorsOf(current.shares)
    return (
      <Flex vertical style={COLUMN_STYLE}>
        <title>Totals · OwnLedger</title>
        {renderHeader()}
        {renderTotalSpent(totals)}
        {renderCurrencySelect(totals, current)}
        {renderSplit('Shares', 'Shares', current.shares, current, colors)}
        {renderSplit('Individual contribution', 'Paid', current.paid, current, colors)}
      </Flex>
    )
  }

  switch (state.status) {
    case 'loading':
      return <LoadingMessage label="Loading the totals" />
    case 'error':
      return (
        <CenteredMessage>
          <LoadError title="Couldn't load the totals" onRetry={retry} error={state.error} backTo={ROUTES.group(id)} />
        </CenteredMessage>
      )
    case 'ready':
      if (!state.data) {
        return (
          <CenteredMessage>
            <title>Group not found · OwnLedger</title>
            <GroupNotFound />
          </CenteredMessage>
        )
      }
      return renderTotals(state.data)
  }
}
