import { useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import Intro from './components/Intro'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Manifesto from './components/Manifesto'
import Ticker from './components/Ticker'
import PartyBreak from './components/PartyBreak'
import PhotoStrip from './components/PhotoStrip'
import Waiting from './components/Waiting'
import Venue from './components/Venue'
import DressUp from './components/DressUp'
import HellIchor from './components/HellIchor'
import HorrorRoom from './components/HorrorRoom'
import Passes from './components/Passes'
import Team from './components/Team'
import Archive from './components/Archive'
import FinalCTA from './components/FinalCTA'
import PassModal from './components/PassModal'
import StickyPass from './components/StickyPass'
import SoundToggle from './components/SoundToggle'
import { initSmoothScroll, lockScroll } from './lib/scroll'
import { PassContext, usePass } from './lib/usePass'

export default function App() {
  const [ready, setReady] = useState(false)
  const { open, openPass, closePass } = usePass()

  useEffect(() => initSmoothScroll(), [])

  // Leave the tab and FERAL notices.
  useEffect(() => {
    const title = document.title
    const onVis = () => (document.title = document.hidden ? 'COME BACK.' : title)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  useEffect(() => lockScroll(open || !ready), [open, ready])

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <PassContext.Provider value={openPass}>
          <Intro onDone={() => setReady(true)} />
          <Navbar />
          <main>
            <Hero ready={ready} />
            <Ticker />
            <PartyBreak />
            <Manifesto />
            <PhotoStrip />
            <DressUp />
            <HellIchor />
            <HorrorRoom />
            <Venue />
            <Waiting />
            <Passes />
            <Team />
            <Archive />
            <FinalCTA />
          </main>
          <StickyPass />
          <SoundToggle />
          <AnimatePresence>{open && <PassModal onClose={closePass} />}</AnimatePresence>
          <div className="grain" aria-hidden="true" />
        </PassContext.Provider>
      </MotionConfig>
    </LazyMotion>
  )
}
