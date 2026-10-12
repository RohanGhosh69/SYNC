// Helps in keeping the loop steady .
// It handles the overall state.

export const PHASES = ['loading', 'intro', 'hero', 'ending', 'breaking']

export const CAN_GO = {
  loading:  ['intro'],
  intro:    ['hero'],
  hero:     ['ending', 'breaking'],
  ending:   ['hero'],
  breaking: ['intro'],
}

// When the loader is ready, change this to 'loading'.
// Dev shortcut: open /?phase=hero to jump to any phase while building.
export function getStartPhase() {
  const fromUrl = new URLSearchParams(window.location.search).get('phase')
  if (fromUrl && PHASES.includes(fromUrl)) return fromUrl
  return 'intro' // have to change to loader later.
}
