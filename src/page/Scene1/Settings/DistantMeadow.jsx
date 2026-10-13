import { useRef } from "react";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "../../../state/motion";

export default function DistantMeadow() {
  const texture = useTexture("/images/meadow.png");
  const materialRef = useRef();

  texture.colorSpace = THREE.SRGBColorSpace;

  useFrame(() => {
    if (!materialRef.current) return;

    const progress = THREE.MathUtils.clamp(motion.progress, 0, 1);

    materialRef.current.uniforms.uProgress.value =
      1 - THREE.MathUtils.smoothstep(progress, 0.3, 0.7);
  });

  return (
    <mesh position={[0, 3.6, -65]} renderOrder={1}>
      <planeGeometry args={[100, 35]} />

      <shaderMaterial
        ref={materialRef}
        uniforms={{
          uTexture: { value: texture },
          uProgress: { value: 1 },
          uBottomFade: { value: 0.36 },
        }}
        vertexShader={`
          varying vec2 vUv;

          void main() {
            vUv = uv;

            gl_Position = projectionMatrix
              * modelViewMatrix
              * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
            uniform sampler2D uTexture;
uniform float uProgress;
uniform float uBottomFade;

varying vec2 vUv;

void main() {
  vec4 color = texture2D(uTexture, vUv);

  // Fade the bottom edge into the 3D terrain.
  float bottomFade = smoothstep(
    0.0,
    uBottomFade,
    vUv.y
  );

  // Preserve the camera-progress fade.
  float finalAlpha = color.a * bottomFade * uProgress;

  if (finalAlpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(color.rgb, finalAlpha);

  // Convert the output to the renderer's color space.
  #include <colorspace_fragment>
        
}`}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}
