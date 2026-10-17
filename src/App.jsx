import SmoothScroll from "./core/SmoothScroll";
import ExperienceCanvas from "./core/ExpCanvas";
import Background from "./page/Scene1/Components/Background";

export default function App() {
  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundColor: "red", // for testing purpose only.
        backgroundAttachment: "fixed",
      }}
    >
      <SmoothScroll />

      <ExperienceCanvas />

      <main className="pointer-events-none relative z-10 h-[400vh]">
        <Background />
      </main>
    </div>
  );
}
