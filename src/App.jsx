import SmoothScroll from "./core/SmoothScroll";
import ExperienceCanvas from "./core/ExpCanvas";

export default function App() {
  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundImage:
          "linear-gradient(180deg, #B8E3FF 0%, #DDF2FF 45%, #F0F8FF 75%, #FFF4E8 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <SmoothScroll />

      <ExperienceCanvas />

      <main className="pointer-events-none relative z-10 h-[400vh]">
        {/* DOM text, logos and UI will go here in step 5 */}
      </main>
    </div>
  );
}
