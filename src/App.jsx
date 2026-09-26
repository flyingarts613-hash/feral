import { useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import Intro from './components/Intro'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Manifesto from './components/Manifesto'
import Experience from './components/Experience'
import HorrorWorld from './components/HorrorWorld'
import Team from './components/Team'
import Archive from './components/Archive'
import FinalCTA from './components/FinalCTA'
import PassModal from './components/PassModal'
import StickyPass from './components/StickyPass'
import { initSmoothScroll, lockScroll } from './lib/scroll'
import { PassContext, usePass } from './lib/usePass'

export default function App() {
  const [ready, setReady] = useState(false)
  const { open, openPass, closePass } = usePass()

  useEffect(() => initSmoothScroll(), [])
  useEffect(() => lockScroll(open || !ready), [open, ready])

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <PassContext.Provider value={openPass}>
          <Intro onDone={() => setReady(true)} />
          <Navbar />
          <main>
            <Hero ready={ready} />
            <Manifesto />
            <Experience />
            <HorrorWorld />
            <Team />
            <Archive />
            <FinalCTA />
          </main>
          <StickyPass />
          <AnimatePresence>{open && <PassModal onClose={closePass} />}</AnimatePresence>
          <div className="grain" aria-hidden="true" />
        </PassContext.Provider>
      </MotionConfig>
    </LazyMotion>
  )
}
