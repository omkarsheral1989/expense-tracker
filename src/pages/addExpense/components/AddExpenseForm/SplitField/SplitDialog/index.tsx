import { CheckOutlined } from '@ant-design/icons'
import { Button, Checkbox, Flex, Input, Select, Tabs, Typography } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import type { SplitMethod } from '../../../../../../db/types.ts'
import type { GroupMember } from '../../../../../../services/groupService/types.ts'
import { moneyService } from '../../../../../../services/moneyService'
import { AmountInput } from '../../AmountInput'
import type { SplitValue } from '../../types.ts'
import { SPLIT_TAB_CONTENT } from './content.tsx'
import { MemberLine } from './MemberLine'
import { BALANCE_TEXT_TYPE } from './style.ts'
import type { SplitDraft } from './types.ts'
import { draftFrom, draftProblem, previewOf, SPLIT_TABS, splitFromDraft, summaryOf } from './utils.ts'

const { Text, Title } = Typography

/** Longest whole number a percentage (3 digits) or a number of shares (4 digits) can have. */
const MAX_DIGITS: Record<'percent' | 'shares', number> = { percent: 3, shares: 4 }

type Props = {
  open: boolean
  onClose: () => void
  /** The user first, then the others A to Z. */
  members: GroupMember[]
  /** The split as it is now; the dialog starts from it. */
  value: SplitValue
  /** The expense's amount in minor units, or null while none is typed. */
  amountMinor: number | null
  currency: string
  /** Called with the new split when the tick accepts it. */
  onDone: (split: SplitValue) => void
}

/**
 * Who paid and how the expense is split, in full: a "Paid by" choice, then a
 * tab per method (equally, exact amounts, percentages, shares, adjustment).
 * The tick at the bottom accepts the split only when it adds up; otherwise it
 * says why and the dialog stays open. Opened afresh (with a new `key`) each
 * time, so it always starts from the current split.
 */
export function SplitDialog({ open, onClose, members, value, amountMinor, currency, onDone }: Props) {
  const memberIds = members.map((member) => member.personId)
  const [draft, setDraft] = useState<SplitDraft>(() => draftFrom(value, memberIds, currency))
  const [problem, setProblem] = useState<string | null>(null)
  const preview = previewOf(draft, amountMinor, memberIds, currency)
  const summary = summaryOf(draft, amountMinor, currency)

  function change(next: Partial<SplitDraft>) {
    setDraft({ ...draft, ...next })
    setProblem(null)
  }

  function setEntry(method: Exclude<SplitMethod, 'equal'>, personId: string, entry: string) {
    change({ [method]: { ...draft[method], [personId]: entry } })
  }

  function handleDone() {
    const found = draftProblem(draft, amountMinor, memberIds, currency)
    if (found) {
      setProblem(found)
      return
    }
    onDone(splitFromDraft(draft, currency))
  }

  function detailOf(member: GroupMember) {
    const owed = preview?.[member.personId]
    return owed === undefined ? undefined : moneyService.format(owed, currency)
  }

  function nameOf(member: GroupMember) {
    return member.isYou ? 'you' : (member.name ?? member.email)
  }

  function renderEntry(method: SplitMethod, member: GroupMember) {
    const id = member.personId
    switch (method) {
      case 'equal':
        return (
          <Checkbox
            aria-label={`Split with ${nameOf(member)}`}
            checked={draft.equal[id]}
            onChange={(event) => change({ equal: { ...draft.equal, [id]: event.target.checked } })}
          />
        )
      case 'exact':
      case 'adjustment':
        return (
          <AmountInput
            large={false}
            currency={currency}
            label={`${method === 'exact' ? 'Amount' : 'Extra'} for ${nameOf(member)}`}
            prefix={method === 'adjustment' ? '+' : undefined}
            value={draft[method][id]}
            onChange={(entry) => setEntry(method, id, entry)}
          />
        )
      case 'percent':
      case 'shares':
        return (
          <Input
            inputMode="numeric"
            autoComplete="off"
            aria-label={`${method === 'percent' ? 'Percentage' : 'Shares'} for ${nameOf(member)}`}
            placeholder="0"
            suffix={method === 'percent' ? '%' : draft.shares[id] === '1' ? 'share' : 'shares'}
            value={draft[method][id]}
            onChange={(event) =>
              setEntry(method, id, event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS[method]))
            }
            styles={{ input: { textAlign: 'end' } }}
          />
        )
    }
  }

  function renderMember(method: SplitMethod, member: GroupMember) {
    return (
      <MemberLine key={member.personId} member={member} detail={detailOf(member)}>
        {renderEntry(method, member)}
      </MemberLine>
    )
  }

  function renderTab(method: SplitMethod) {
    const { tab, heading, hint, icon } = SPLIT_TAB_CONTENT[method]
    return {
      key: method,
      label: tab,
      children: (
        <Flex vertical gap={8}>
          <Flex align="center" gap={8}>
            <span style={{ fontSize: 20 }} aria-hidden>
              {icon}
            </span>
            <Title level={5} style={{ margin: 0 }}>
              {heading}
            </Title>
          </Flex>
          <Text type="secondary">{hint}</Text>
          {members.map((member) => renderMember(method, member))}
        </Flex>
      ),
    }
  }

  function renderFooter() {
    return (
      <Flex vertical gap={8} style={{ textAlign: 'start' }}>
        <Flex align="center" justify="space-between" gap={12}>
          <Flex vertical>
            <Text strong>{summary.total}</Text>
            {summary.balance && (
              <Text type={BALANCE_TEXT_TYPE[summary.balance.kind]}>{summary.balance.text}</Text>
            )}
          </Flex>
          <Button type="primary" icon={<CheckOutlined />} aria-label="Done" onClick={handleDone} />
        </Flex>
        {problem && (
          <Text type="danger" role="alert">
            {problem}
          </Text>
        )}
      </Flex>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={onClose} title="Split options" tall footer={renderFooter()}>
      <Flex vertical gap={12}>
        <Flex align="center" gap={8}>
          <Text>Paid by</Text>
          <Select
            aria-label="Paid by"
            value={draft.paidBy}
            onChange={(paidBy) => change({ paidBy })}
            options={members.map((member) => ({
              value: member.personId,
              label: member.isYou ? 'You' : (member.name ?? member.email),
            }))}
            style={{ flex: 1, minWidth: 0 }}
          />
        </Flex>
        <Tabs
          activeKey={draft.method}
          // Only the open tab is on the page, so its parts are the only ones shown.
          destroyOnHidden
          // Small, close-set tabs, so all five fit across a phone.
          size="small"
          tabBarGutter={14}
          onChange={(method) => change({ method: method as SplitMethod })}
          items={SPLIT_TABS.map(renderTab)}
        />
      </Flex>
    </AdaptiveDialog>
  )
}
