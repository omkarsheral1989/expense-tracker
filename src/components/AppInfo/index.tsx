import type { ReactNode } from 'react'
import { Faq } from './components/Faq'
import { Features } from './components/Features'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { Privacy } from './components/Privacy'

type Props = {
  /** The app's version, shown under its name (the About page); left out on the welcome page. */
  version?: string
  /** What sits under the hero's highlight lines (the welcome page's install card and start button). */
  children?: ReactNode
}

/**
 * What the app is, as the welcome page and the About page tell it: the hero, the
 * features, privacy, how it works, the questions and the footer.
 */
export function AppInfo({ version, children }: Props) {
  return (
    <main>
      <Hero version={version}>{children}</Hero>
      <Features />
      <Privacy />
      <HowItWorks />
      <Faq />
      <Footer />
    </main>
  )
}
