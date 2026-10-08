import {
  CalculatorOutlined,
  PercentageOutlined,
  PieChartOutlined,
  PlusCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { SplitMethod } from '../../../../../../db/types.ts'

type TabContent = {
  /** The tab's own short name. */
  tab: string
  heading: string
  /** One line on how the tab works. */
  hint: string
  icon: ReactNode
}

/** The words and icon of each tab of the split dialog. Every method must have an entry. */
export const SPLIT_TAB_CONTENT: Record<SplitMethod, TabContent> = {
  equal: {
    tab: 'Equally',
    heading: 'Split equally',
    hint: 'Tick who shares it. Untick anyone it was not for.',
    icon: <TeamOutlined />,
  },
  exact: {
    tab: 'Amounts',
    heading: 'Split by exact amounts',
    hint: 'Enter how much each person owes. Together they must make the total.',
    icon: <CalculatorOutlined />,
  },
  percent: {
    tab: 'Percent',
    heading: 'Split by percentages',
    hint: 'Enter each person\'s share in whole percent. Together they must make 100%.',
    icon: <PercentageOutlined />,
  },
  shares: {
    tab: 'Shares',
    heading: 'Split by shares',
    hint: 'Give each person a number of shares, for example 2 for a couple and 1 for one person.',
    icon: <PieChartOutlined />,
  },
  adjustment: {
    tab: 'Adjust',
    heading: 'Split by adjustment',
    hint: 'Enter anything extra a person owes. The rest is split equally between everyone.',
    icon: <PlusCircleOutlined />,
  },
}
