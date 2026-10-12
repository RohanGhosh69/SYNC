import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from '../state/motion'
import { userExp } from '../state/userExp'

gsap.registerPlugin(ScrollTrigger)

// One Lenis instance for the whole app
export let lenis = null

export default function SmoothScroll() {
  const phase = userExp((s) => s.phase)

  useEffect(() => {
    lenis = new Lenis({
      lerp: 0.08,
    })

    // Listen for scroll updates
    lenis.on('scroll', (e) => {
      motion.progress = e.progress
      motion.velocity = e.velocity

      ScrollTrigger.update()
    })

    // Connect Lenis to GSAP's ticker
    const tick = (time) => {
      lenis.raf(time * 1000)
    }

    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    // Cleanup
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenis = null
    }
  }, [])

  // Reset scroll whenever the experience phase changes
  useEffect(() => {
    lenis?.scrollTo(0, {
      immediate: true,
      force: true,
    })

    motion.progress = 0
    motion.velocity = 0

    requestAnimationFrame(() => {
      lenis?.resize()
    })
  }, [phase])

  return null
}