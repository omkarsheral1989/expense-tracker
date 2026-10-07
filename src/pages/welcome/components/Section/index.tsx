import type { ReactNode } from 'react'
import { Flex, theme, Typography } from 'antd'

const { Title, Paragraph } = Typography

type Props = {
  id?: string
  title: string
  subtitle?: string
  tinted?: boolean
  children: ReactNode
}

export function Section({ id, title, subtitle, tinted, children }: Props) {
  const { token } = theme.useToken()

  return (
    <section
      id={id}
      style={{
        padding: '56px 16px',
        scrollMarginTop: 16,
        background: tinted ? token.colorPrimaryBg : undefined,
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <Flex
          vertical
          align="center"
          gap={8}
          style={{ textAlign: 'center', marginBottom: 32 }}
        >
          <Title level={2} style={{ margin: 0 }}>
            {title}
          </Title>
          {subtitle && (
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 16 }}>
              {subtitle}
            </Paragraph>
          )}
        </Flex>
        {children}
      </div>
    </section>
  )
}
