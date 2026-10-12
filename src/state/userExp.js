// Zustand Logic
import { create } from 'zustand'
import { CAN_GO, getStartPhase } from './phases'

export const userExp = create((set, get) => ({
  phase: getStartPhase(),
  introStep: 'descending',
  loop: 0, // how many times the user has broken the dream

  go: (next) => {
    const { phase, loop } = get()
    if (!CAN_GO[phase]?.includes(next)) {
      console.warn(`[experience] blocked transition ${phase} -> ${next}`)
      return false
    }
    set({
      phase: next,
      introStep: next === 'intro' ? 'descending' : get().introStep,
      loop: next === 'intro' && phase === 'breaking' ? loop + 1 : loop,
    })
    return true
  },

  setIntroStep: (introStep) => set({ introStep }),

  // Called when the user taps the radio knob.
  tuneRadio: () => {
    if (get().introStep !== 'ready') return
    set({ introStep: 'tuned' })
    // Placeholder: the petal burst (Task: Petals) will own this timing later.
    setTimeout(() => get().go('hero'), 1500)
  },
}))
