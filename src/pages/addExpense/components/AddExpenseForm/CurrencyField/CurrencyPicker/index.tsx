import { CheckOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Empty, Flex, Input, Typography } from 'antd'
import { useState } from 'react'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import { currencyService } from '../../../../../../services/currencyService'
import type { CurrencyOption } from '../../../../../../services/currencyService/types.ts'

const { Text } = Typography

type Props = {
  open: boolean
  onClose: () => void
  /** The currency chosen now; it is marked in the list. */
  value: string
  /** Listed first, under "Recent": the group's currency and the user's latest ones. */
  recentCodes: string[]
  /** Called with the code of the currency the user taps. */
  onPick: (code: string) => void
}

/**
 * Every ISO currency to pick one from, with the recent ones first. Searching
 * by code or name narrows the list.
 */
export function CurrencyPicker({ open, onClose, value, recentCodes, onPick }: Props) {
  const [query, setQuery] = useState('')
  const options = currencyService.options(navigator.language)
  const search = query.trim().toLowerCase()

  function handleClose() {
    setQuery('')
    onClose()
  }

  function handlePick(code: string) {
    setQuery('')
    onPick(code)
  }

  function renderOption(option: CurrencyOption) {
    const selected = option.value === value
    return (
      <Button
        key={option.value}
        type="text"
        block
        aria-pressed={selected}
        onClick={() => handlePick(option.value)}
        style={{ justifyContent: 'space-between', height: 'auto', padding: '8px 12px' }}
      >
        <span style={{ whiteSpace: 'normal', textAlign: 'start' }}>{option.label}</span>
        {selected && <CheckOutlined aria-hidden />}
      </Button>
    )
  }

  function renderSection(title: string, list: CurrencyOption[]) {
    if (list.length === 0) return null
    return (
      <Flex vertical gap={2} role="group" aria-label={title}>
        <Text type="secondary" strong style={{ padding: '0 12px' }}>
          {title}
        </Text>
        {list.map(renderOption)}
      </Flex>
    )
  }

  function renderLists() {
    if (search) {
      const found = options.filter((option) => option.label.toLowerCase().includes(search))
      if (found.length === 0) return <Empty description="No currency matches" />
      return renderSection('Search results', found)
    }
    const recent = recentCodes
      .map((code) => options.find((option) => option.value === code))
      .filter((option) => option !== undefined)
    return (
      <>
        {renderSection('Recent', recent)}
        {renderSection('All currencies', options)}
      </>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={handleClose} title="Choose a currency" tall>
      <Flex vertical gap={16}>
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder="Search by code or name"
          aria-label="Search currencies"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {renderLists()}
      </Flex>
    </AdaptiveDialog>
  )
}
