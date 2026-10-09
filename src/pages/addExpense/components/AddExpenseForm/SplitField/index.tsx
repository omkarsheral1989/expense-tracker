import { Button, Tooltip, Typography } from 'antd'
import { useState, type ReactNode } from 'react'
import type { GroupMember } from '../../../../../services/groupService/types.ts'
import type { SplitValue } from '../types.ts'
import { PayerDialog } from './PayerDialog'
import { QuickChoiceDialog } from './QuickChoiceDialog'
import { SplitDialog } from './SplitDialog'
import { nameInSentence, quickChoices, sameSplit } from './utils.ts'

const { Paragraph } = Typography

type Props = {
  /** Given by the form item, so that its messages are tied to the first button. */
  id?: string
  value?: SplitValue
  onChange?: (split: SplitValue) => void
  /** The user first, then the others A to Z. */
  members: GroupMember[]
  /** The expense's amount in minor units, or null while none is typed. */
  amountMinor: number | null
  currency: string
}

/**
 * Who paid and how the expense is split, as a sentence: "Paid by [you] and
 * split [equally]" ("unequally" for any other method). The first button
 * chooses who paid, the second opens the split options. A group of two shows
 * one button with its four quick choices instead, as long as the split is one
 * of them. In a group of one there is nobody to split with, so the buttons are
 * switched off. Works as an Ant Design form field.
 */
export function SplitField({ id, value, onChange, members, amountMinor, currency }: Props) {
  const [dialog, setDialog] = useState<'payer' | 'quick' | 'split' | null>(null)
  // A new key opens the split dialog afresh, starting from the current split.
  const [splitDialogKey, setSplitDialogKey] = useState(0)

  if (!value) return null
  const split = value
  const you = members.find((member) => member.isYou) ?? members[0]
  const payer = members.find((member) => member.personId === split.paidBy) ?? you
  const others = members.filter((member) => !member.isYou)
  const choices = others.length === 1 ? quickChoices(you, others[0]) : []
  const quickChoice = choices.find((choice) => sameSplit(choice.value, split))

  function pick(next: SplitValue) {
    onChange?.(next)
    setDialog(null)
  }

  function openSplitOptions() {
    setSplitDialogKey(splitDialogKey + 1)
    setDialog('split')
  }

  function renderSentence() {
    const alone = members.length === 1
    const payerButton = (
      <Button id={id} size="small" disabled={alone} onClick={() => setDialog('payer')}>
        {nameInSentence(payer)}
      </Button>
    )
    const splitButton = (
      <Button size="small" disabled={alone} onClick={openSplitOptions}>
        {split.method === 'equal' ? 'equally' : 'unequally'}
      </Button>
    )
    const tip = (button: ReactNode) =>
      alone ? (
        <Tooltip title="You are the only member of this group.">
          <span style={{ display: 'inline-flex' }}>{button}</span>
        </Tooltip>
      ) : (
        button
      )

    return (
      <>
        Paid by {tip(payerButton)} and split {tip(splitButton)}
      </>
    )
  }

  function renderQuickChoice(label: string) {
    return (
      <Button id={id} onClick={() => setDialog('quick')}>
        {label}
      </Button>
    )
  }

  return (
    <>
      <Paragraph style={{ textAlign: 'center', margin: 0, lineHeight: '32px' }}>
        {quickChoice ? renderQuickChoice(quickChoice.label) : renderSentence()}
      </Paragraph>
      <PayerDialog
        open={dialog === 'payer'}
        onClose={() => setDialog(null)}
        members={members}
        value={split.paidBy}
        onPick={(paidBy) => pick({ ...split, paidBy })}
      />
      <QuickChoiceDialog
        open={dialog === 'quick'}
        onClose={() => setDialog(null)}
        choices={choices}
        value={split}
        onPick={pick}
        onMore={openSplitOptions}
      />
      <SplitDialog
        key={splitDialogKey}
        open={dialog === 'split'}
        onClose={() => setDialog(null)}
        members={members}
        value={split}
        amountMinor={amountMinor}
        currency={currency}
        onDone={pick}
      />
    </>
  )
}
