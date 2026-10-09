import { Button, Flex, Typography } from 'antd'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import { CategoryIcon } from '../../../../../../components/CategoryIcon'
import { expenseService } from '../../../../../../services/expenseService'
import type { Category } from '../../../../../../services/expenseService/types.ts'

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
        onClick={() => onPick(category.key)}
        style={{ height: 'auto', padding: 8, justifyContent: 'flex-start' }}
      >
        <Flex align="center" gap={12}>
          <CategoryIcon category={category.key} size={32} />
          <span>{category.label}</span>
        </Flex>
      </Button>
    )
  }

  function renderGroup(group: (typeof expenseService.categoryGroups)[number]) {
    const categories = expenseService.categories.filter((category) => category.group === group.key)
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

  return (
    <AdaptiveDialog open={open} onClose={onClose} title="Choose a category" tall>
      <Flex vertical gap={16}>
        {expenseService.categoryGroups.map(renderGroup)}
      </Flex>
    </AdaptiveDialog>
  )
}
