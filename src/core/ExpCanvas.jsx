import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import SceneRouter from "./SceneRouter";
import CinematicBlur from "../page/Scene1/Settings/CinematicBlur";

// ONE persistent 3D canvas for the whole website.
// It is fixed behind the page, never unmounts, and every "page"
// is just a different scene rendered inside it (SceneRouter decides which).
//
// Layer rule for the whole project:
//   canvas  → z-0   (this file)
//   all DOM UI (text, cards, buttons) → z-10 or higher
export default function ExperienceCanvas(props) {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        dpr={[1, 2]} // sharp on retina, capped at 2x so it stays fast
        camera={{ position: [0, 0, 6], fov: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        // fully transparent clear colour: whatever is behind the canvas shows through
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        {/* Placeholder lights: we will replace these with the dream-scene lighting */}
        {/* Soft ambient lighting */}
        <ambientLight intensity={0.7} />

        {/* Warm sunlight coming from the upper-left */}
        <directionalLight
          position={[-6, 10, 4]}
          intensity={2.0}
          color="#FFF1D6"
        />

        {/* Gentle cool fill to preserve natural shadows */}
        <directionalLight
          position={[5, 4, -8]}
          intensity={0.35}
          color="#C9E5FF"
        />

        {/* Suspense: shows nothing while models/textures load, then reveals the scene */}
        <Suspense fallback={null}>
          {/* props are passed straight through, so SceneRouter gets whatever App gives it */}
          <SceneRouter {...props} />
        </Suspense>
        <CinematicBlur />
      </Canvas>
    </div>
  );
}
