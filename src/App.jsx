import SmoothScroll from './core/SmoothScroll'
import ExperienceCanvas from './core/ExpCanvas'

export default function App() {
  return (
    <div className="relative min-h-screen">
      <SmoothScroll />

      <ExperienceCanvas />

      <main className="pointer-events-none relative z-10 h-[400vh]">
        {/* DOM text, logos and UI will go here in step 5 */}
      </main>
    </div>
  )
}
