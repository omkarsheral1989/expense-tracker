import { Grid, Steps } from 'antd'
import { STEPS } from './content.ts'
import { Section } from '../Section'

export function HowItWorks() {
  const screens = Grid.useBreakpoint()

  return (
    <Section title="How it works">
      <Steps
        orientation={screens.md ? 'horizontal' : 'vertical'}
        items={STEPS.map(({ title, text }) => ({
          title,
          content: text,
          status: 'process' as const,
        }))}
      />
    </Section>
  )
}
