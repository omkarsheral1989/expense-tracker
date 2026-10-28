import { Icon } from '../../../Icon'
import { Button, Flex, Input, Typography } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../AdaptiveDialog'
import { CategoryIcon } from '../../../CategoryIcon'
import { expenseService } from '../../../../services/expenseService'
import type { Category } from '../../../../services/expenseService/types.ts'

const { Text } = Typography

type Props = {
  open: boolean
  onClose: () => void
  /** The category chosen now; it is marked in the list. */
  value: string
  /** Called with the key of the category the user taps. */
  onPick: (key: string) => void
}

/** Every category, under the name of its group, to pick one from. */
export function CategoryPicker({ open, onClose, value, onPick }: Props) {
  const [search, setSearch] = useState('')

  function close() {
    setSearch('')
    onClose()
  }

  function pick(key: string) {
    setSearch('')
    onPick(key)
  }

  function renderCategory(category: Category) {
    const selected = category.key === value
    return (
      <Button
        key={category.key}
        type={selected ? 'primary' : 'text'}
        ghost={selected}
        aria-label={
          category.label === 'Other' ? `${category.groupLabel}: Other` : category.label
        }
        aria-pressed={selected}
        onClick={() => pick(category.key)}
        style={{ height: 'auto', padding: 8, justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }}
      >
        <Flex align="center" gap={12} style={{ minWidth: 0 }}>
          <CategoryIcon category={category.key} size={32} />
          <span style={{ minWidth: 0 }}>{category.label}</span>
        </Flex>
      </Button>
    )
  }

  function renderGroup(group: (typeof expenseService.categoryGroups)[number]) {
    const categories = expenseService.categories.filter(
      (category) => category.group === group.key && expenseService.categoryMatches(category, search),
    )
    if (categories.length === 0) return null
    return (
      <Flex key={group.key} vertical gap={4} role="group" aria-label={group.label}>
        <Text type="secondary" strong>
          {group.label}
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 4 }}>
          {categories.map(renderCategory)}
        </div>
      </Flex>
    )
  }

  const hasMatch = expenseService.categories.some(
    (category) => category.group !== expenseService.settlementCategory && expenseService.categoryMatches(category, search),
  )

  return (
    <AdaptiveDialog open={open} onClose={close} title="Choose a category" tall>
      <Flex vertical gap={16}>
        <Input
          allowClear
          prefix={<Icon name="search" />}
          placeholder="Search, for example Netflix or PPF"
          aria-label="Search categories"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {expenseService.categoryGroups.map(renderGroup)}
        {hasMatch ? null : <Text type="secondary">No matching category.</Text>}
      </Flex>
    </AdaptiveDialog>
  )
}
