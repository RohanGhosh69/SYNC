import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LIGHTING } from "../Settings/LightConfig";

// SkyDome: the sky, drawn INSIDE the 3D canvas instead of by a CSS gradient.
//
// Why: fog, mountains, clouds, lighting and the blur pass all need to agree
// on the sky colour. A CSS gradient lives outside WebGL, so none of them can
// read it. Here the sky colours are exported (SKY) and everyone shares them.
//
// How: a big sphere centred on the camera, drawn first, behind everything.
// Its shader colours each pixel by the direction you are looking in:
// looking at the horizon = pale haze, looking higher = deeper blue.

// ONE place for the sky palette. Terrain's fog uses SKY.horizon, so far hills
// fade into exactly the sky colour at the horizon (no cream band).
export const SKY = {
  top: "#3C9BEB", // deep blue, top of the screen
  mid: "#86CBF5", // clear blue in the middle
  horizon: "#D2ECFA", // pale haze at the horizon (also the fog colour)
};

const RADIUS = 400; // must stay below the camera far plane (R3F default: 1000)

// The camera looks almost level with fov 40, so the top of the screen is only
// about 0.4 above the horizon (0 = horizon, 1 = straight up). The whole colour
// gradient is squeezed into that visible range so you actually see it.
const VISIBLE_SPAN = 0.42;

// Sun glow strength. halo = the wide soft glow, core = the tighter bright
// part near the sun, horizonKeep = how much glow survives right at the horizon
// (0 = none, 1 = full). Keep it low so the horizon stays equal to the fog colour.
const SUN_GLOW = { halo: 0.8, core: 0.8, horizonKeep: 0.3 };

const vertexShader = /* glsl */ `
  varying vec3 vDir;

  void main() {
    // The sphere is centred on the camera, so a vertex's local position
    // already points in the direction we are looking: it IS the direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform float uSpan;
  uniform vec3 uSunDir;    // direction toward the sun (normalised)
  uniform vec3 uSunColor;  // warm sunlight colour
  uniform vec3 uSunGlow;   // x = halo, y = core, z = horizonKeep

  varying vec3 vDir;

  // Tiny random number from the pixel position (used for dithering below).
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // 0 at the horizon, 1 at the top of the visible screen.
    float t = clamp(normalize(vDir).y / uSpan, 0.0, 1.0);

    // Two blends stacked: horizon -> mid, then mid -> top.
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.5, t));
        col = mix(col, uTop, smoothstep(0.4, 1.0, t));

    // Sun glow. dot() of two directions is 1 when they point the same way and
    // falls toward 0 as they separate, so sunAmt is 1 looking straight at the
    // sun. max() ignores the side facing away from it.
    vec3 dir = normalize(vDir);
    float sunAmt = max(dot(dir, uSunDir), 0.0);
    // pow() tightens the falloff. Power 5 gives a wide soft halo and power 60 a
    // small bright core, and we add the two.
    float glow = pow(sunAmt, 5.0) * uSunGlow.x + pow(sunAmt, 60.0) * uSunGlow.y;
    // Fade the glow near the horizon. The far hills fade into exactly the plain
    // horizon colour (the fog), so a warmer horizon would not match them.
    glow *= mix(uSunGlow.z, 1.0, smoothstep(0.0, 0.2, dir.y));
    // Add warm light on top of the blue. Adding, not mixing, makes it glow.
    col += uSunColor * glow;
    gl_FragColor = vec4(col, 1.0);

    // Our colours are linear; this converts them to what the screen shows,
    // so the on-screen colour equals the hex you typed in SKY.
    #include <colorspace_fragment>

    // Dither: add +-half a colour step of noise. A smooth blue gradient
    // otherwise shows visible bands on 8-bit screens; this hides them.
    gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  }
`;

export default function SkyDome() {
  const mesh = useRef();

  // Built once. THREE.Color turns each hex into the linear values the shader expects.
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(SKY.top) },
      uMid: { value: new THREE.Color(SKY.mid) },
      uHorizon: { value: new THREE.Color(SKY.horizon) },
      uSpan: { value: VISIBLE_SPAN },
      uSunDir: { value: LIGHTING.sunDirection }, // already normalised
      uSunColor: { value: new THREE.Color(LIGHTING.sunColor) },
      uSunGlow: {
        value: new THREE.Vector3(
          SUN_GLOW.halo,
          SUN_GLOW.core,
          SUN_GLOW.horizonKeep,
        ),
      },
    }),
    [],
  );

  // Keep the dome centred on the camera so the sky is always "infinitely far"
  // (it never gets closer as the camera travels toward the door).
  useFrame(({ camera }) => {
    if (mesh.current) mesh.current.position.copy(camera.position);
  });

  return (
    // renderOrder -1000: drawn before everything else, so all scene objects
    // paint on top of it. frustumCulled off: the camera is always inside it.
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[RADIUS, 32, 16]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide} // we are INSIDE the sphere, so draw its inner faces
        depthTest={false} // never hidden by, and never hides, anything
        depthWrite={false}
        toneMapped={false} // keep the exact colours, like the clouds
        fog={false} // the sky must not be fogged
      />
    </mesh>
  );
}
