import { Faq } from './Faq.tsx'
import { Features } from './Features.tsx'
import { Footer } from './Footer.tsx'
import { Hero } from './Hero.tsx'
import { HowItWorks } from './HowItWorks.tsx'
import { Privacy } from './Privacy.tsx'

export function WelcomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <Privacy />
      <HowItWorks />
      <Faq />
      <Footer />
    </main>
  )
}
