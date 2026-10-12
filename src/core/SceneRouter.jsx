import { userExp } from "../state/userExp";
import Background from "../page/Scene1/Background";


// Picks which 3D scene is mounted for the current phase.
// Add HeroScene / EndingScene / BreakScene here as they get built.
export default function SceneRouter() {
  const phase = userExp((s) => s.phase);

  switch (phase) {
    case "intro":
      return (
        <>
          <Background />
        </>
      );
    default:
      return null;
  }
}
