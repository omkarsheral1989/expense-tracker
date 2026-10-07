import { useEffect, type ReactNode } from 'react'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import { useColorScheme } from '../hooks/useColorScheme'
import { RADIUS } from './radius.ts'

const PRIMARY = '#0d9488'

/** Keeps the page background and browser UI in step with the Ant Design theme. */
function PageBackground({ children }: { children: ReactNode }) {
  const { token } = theme.useToken()
  const scheme = useColorScheme()

  useEffect(() => {
    document.body.style.background = token.colorBgLayout
    document.documentElement.style.colorScheme = scheme
  }, [token.colorBgLayout, scheme])

  return children
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()

  return (
    <ConfigProvider
      theme={{
        algorithm:
          scheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: PRIMARY,
          colorLink: PRIMARY,
          // Two tiers only: inner for small controls, outer (LG) for containers.
          borderRadius: RADIUS.inner,
          borderRadiusSM: RADIUS.inner,
          borderRadiusXS: RADIUS.inner,
          borderRadiusLG: RADIUS.outer,
        },
        // "Large" controls would otherwise pick up the outer radius and turn
        // into pills, so keep them on the inner tier.
        components: {
          Button: { borderRadiusLG: RADIUS.inner },
          Input: { borderRadiusLG: RADIUS.inner },
          InputNumber: { borderRadiusLG: RADIUS.inner },
          Select: { borderRadiusLG: RADIUS.inner },
          DatePicker: { borderRadiusLG: RADIUS.inner },
        },
      }}
    >
      <AntApp>
        <PageBackground>{children}</PageBackground>
      </AntApp>
    </ConfigProvider>
  )
}
