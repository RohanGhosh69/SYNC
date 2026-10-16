import { LIGHTING } from "./LightConfig";

export default function SceneLighting() {
  return (
    <>
      <ambientLight
        intensity={LIGHTING.ambientIntensity}
        color={LIGHTING.ambientColor}
      />

      <directionalLight
        position={LIGHTING.sunPosition}
        intensity={LIGHTING.sunIntensity}
        color={LIGHTING.sunColor}
      />

      <directionalLight
        position={[5, 4, -8]}
        intensity={LIGHTING.fillIntensity}
        color={LIGHTING.fillColor}
      />
    </>
  );
}