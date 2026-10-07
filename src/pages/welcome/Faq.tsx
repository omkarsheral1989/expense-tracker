import { Collapse, Typography } from 'antd'
import { FAQ } from './content.tsx'
import { Section } from './Section.tsx'

const { Paragraph } = Typography

export function Faq() {
  return (
    <Section id="faq" title="Questions and answers">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Collapse
          items={FAQ.map(({ key, question, answer }) => ({
            key,
            label: question,
            children: <Paragraph style={{ margin: 0 }}>{answer}</Paragraph>,
          }))}
        />
      </div>
    </Section>
  )
}
