import { userExp } from "../state/userExp";
import CameraRig from "../page/Scene1/Settings/CameraRig";
import PointerGround from "../page/Scene1/Settings/PointerGround";
import Terrain from "../page/Scene1/Settings/Terrain";
import Grass from "../page/Scene1/Settings/Grass";
import Water from "../page/Scene1/Settings/Water";
import Flowers from "../page/Scene1/Settings/Flowers";
import Stones from "../page/Scene1/Settings/Stones";

// Picks which 3D scene is mounted for the current phase.
// Add HeroScene / EndingScene / BreakScene here as they get built.
export default function SceneRouter() {
  const phase = userExp((s) => s.phase);

  switch (phase) {
    case "intro":
      return (
        <>
          <CameraRig />
          <PointerGround />
          <Terrain />
          <Grass />
          <Stones />
          <Flowers />
          <Water />
        </>
      );
    default:
      return null;
  }
}
