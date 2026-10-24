import { Button, Empty, Flex, Spin, Typography } from 'antd'
import { useEffect, useRef } from 'react'
import type { ExpenseListItem } from '../../../../services/expenseService/types.ts'
import { ABOVE_FLOATING_BUTTON, FLOATING_BUTTON_ROOM } from '../../../../components/FloatingPillButton/constants.ts'
import { dateService } from '../../../../services/dateService'
import { ExpenseRow } from './ExpenseRow'
import { groupByMonth, type MonthOfExpenses } from './utils.ts'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'

const { Text } = Typography

type Props = {
  /** Newest day first, as the service returns them. */
  expenses: ExpenseListItem[]
  groupId: string
  /** Whether there are more expenses after the last one in `expenses` (ADR-058). */
  hasMore: boolean
  /** The next batch is being read: a small spinner shows under the list. */
  loadingMore: boolean
  /** Reading the next batch failed: the list ends in a row with Try again. */
  loadMoreFailed: boolean
  /** Reads the next batch; called when the end of the list nears the view, and by Try again. */
  onLoadMore: () => void
}

/** How far before the end of the list the next batch is asked for: about a screen. */
const LOAD_MORE_MARGIN = '600px'

/**
 * The group's expenses, newest first and grouped under a "September 2025"
 * header for each month, or a message when there are none yet. The
 * message's box runs from the actions down to just above the floating Add
 * expense button, and the message is centered in it. (Not on the whole screen:
 * the band, the balance and the actions take the top of it, and the button the
 * bottom, so that would look off.) The space between the actions and the list
 * belongs to the list, not to the page, so the box starts right under the actions.
 */
export function ExpenseList({ expenses, groupId, hasMore, loadingMore, loadMoreFailed, onLoadMore }: Props) {
  const end = useRef<HTMLDivElement>(null)

  // Asks for the next batch when the end of the list comes near the view. Set up again after each
  // batch, so a list that is still short of the view's end asks for the one after.
  useEffect(() => {
    const target = end.current
    if (!target || !hasMore || loadingMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && onLoadMore(), {
      rootMargin: LOAD_MORE_MARGIN,
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore, expenses.length])

  function renderExpense(expense: ExpenseListItem) {
    return <ExpenseRow key={expense.id} expense={expense} groupId={groupId} />
  }

  function renderMonth({ month, expenses }: MonthOfExpenses) {
    const headingId = `expenses-${month}`
    return (
      <Flex vertical key={month}>
        <Text id={headingId} type="secondary" strong role="heading" aria-level={2} style={{ paddingTop: 8 }}>
          {dateService.formatMonth(`${month}-01`)}
        </Text>
        <Flex vertical role="list" aria-labelledby={headingId}>
          {expenses.map(renderExpense)}
        </Flex>
      </Flex>
    )
  }

  function renderEnd() {
    if (loadMoreFailed) {
      return (
        <Flex align="center" justify="center" gap={8} role="alert">
          <Text type="secondary">Couldn't load more.</Text>
          <Button type="link" onClick={onLoadMore}>
            Try again
          </Button>
        </Flex>
      )
    }
    if (!hasMore) return null
    return (
      <div ref={end} data-testid="list-end" style={{ display: 'flex', justifyContent: 'center', padding: 8, minHeight: 40 }}>
        {loadingMore && <Spin size="small" aria-label="Loading more expenses" />}
      </div>
    )
  }

  if (expenses.length === 0) {
    return (
      <Flex align="center" justify="center" style={{ flex: 1, marginBottom: aboveScreenEdge(ABOVE_FLOATING_BUTTON) }}>
        <Empty
          description={
            <>
              <Text strong>No expenses yet</Text>
              <br />
              <Text type="secondary">Expenses you add will appear here.</Text>
            </>
          }
        />
      </Flex>
    )
  }

  return (
    <Flex
      vertical
      gap={8}
      role="region"
      aria-label="Expenses"
      style={{ marginTop: 16, paddingBottom: aboveScreenEdge(FLOATING_BUTTON_ROOM) }}
    >
      {groupByMonth(expenses).map(renderMonth)}
      {renderEnd()}
    </Flex>
  )
}
