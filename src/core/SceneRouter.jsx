import { userExp } from "../state/userExp";
import CameraRig from "../page/Scene1/Settings/CameraRig";
import PointerGround from "../page/Scene1/Settings/PointerGround";
import Terrain from "../page/Scene1/Environment/Terrain";
import Grass from "../page/Scene1/Objects/Grass";
import Water from "../page/Scene1/Environment/Water";
import Flowers from "../page/Scene1/Objects/Flowers";
import Stones from "../page/Scene1/Objects/Stones";
import Clouds from "../page/Scene1/Environment/Clouds";
import SceneLighting from "../page/Scene1/Settings/SceneLight";
import SkyDome from "../page/Scene1/Environment/SkyDome";
import EndHaze from "../page/Scene1/Settings/EndHaze";



// Picks which 3D scene is mounted for the current phase.
// Add HeroScene / EndingScene / BreakScene here as they get built.
export default function SceneRouter() {
  const phase = userExp((s) => s.phase);

  switch (phase) {
    case "intro":
      return (
        <>
          <SkyDome />
          <CameraRig />
          <PointerGround />
          <Terrain />
          <SceneLighting />
          <Clouds />
          <EndHaze />
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
