import { useMemo } from "react";
import * as THREE from "three";
import { terrainHeight, WATER_LEVEL } from "./TerrainHeight";
import { SKY } from "./SkyDome";
import { useFrame } from "@react-three/fiber";
import { CLOUD_SHADOW_GLSL } from "./CloudShadow";

// Terrain: one big mesh whose heights come from terrainHeight(x, z).
// Cost: ~28k vertices, one draw call, one cheap Lambert material.
// The meadow detail (grass, flowers) is NOT here; it comes from instanced
// objects in later steps. This mesh is just the coloured ground + the fog.

export const HORIZON_COLOR = SKY.horizon;

// Palette sampled from the reference image.
//const GRASS_DEEP = new THREE.Color("#526e13"); // foreground grass
//const GRASS_LIGHT = new THREE.Color("#80a241"); // sunlit hills
//const MUD = new THREE.Color("#959272"); // bank at the lake shore

const GRASS_DEEP = new THREE.Color("#4F7A2A");
const GRASS_LIGHT = new THREE.Color("#9DB83C");
const MUD = new THREE.Color("#78634A");

// Three's Lambert material divides light by pi, so terrain comes out about
// half as bright as the grass shader at the same colour. This gain evens it out.
const TERRAIN_GAIN = 1.6;

// Size of the ground and how finely it is cut up.
// Big enough that its edges are always inside the fog (fully hidden).
const SIZE_X = 200;
const SIZE_Z = 220;
const CELL = 0.5; // one quad = 1.25 x 1.25 units
const CENTER_Z = -90; // covers z from -200 (far) to +20 (behind the camera)

export default function Terrain() {
  // Built once. useMemo keeps React from rebuilding 28k vertices on re-render.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      SIZE_X,
      SIZE_Z,
      SIZE_X / CELL,
      SIZE_Z / CELL,
    );
    g.rotateX(-Math.PI / 2); // lay the plane flat (a plane starts upright)
    g.translate(0, 0, CENTER_Z);

    // 1. Lift every vertex to the ground height at its (x, z).
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    g.computeVertexNormals(); // recompute so lighting follows the new shape

    // 2. Paint each vertex. The GPU blends colours between vertices for free.
    const normal = g.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Large soft patches of lighter / deeper green (0..1).
      const patch =
        0.5 +
        0.5 * Math.sin(x * 0.07 + z * 0.05) * Math.cos(z * 0.09 - x * 0.03);
      c.copy(GRASS_DEEP).lerp(GRASS_LIGHT, patch);

      // Subtle slope shading to retain the terrain's rolling shape.
      const slope = normal.getY(i);
      c.multiplyScalar(THREE.MathUtils.lerp(0.85, 1.0, slope));
      c.multiplyScalar(TERRAIN_GAIN);

      // Muddy band right around the waterline.
      const shore =
        1 - THREE.MathUtils.smoothstep(y, WATER_LEVEL, WATER_LEVEL + 0.18);
      c.lerp(MUD, shore);

      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return g;
  }, []);

  // A "uniform" is one value the CPU hands to the shader. The shader reads it
  // on every pixel. Wrapping it in { value } lets us change it without rebuilding
  // the material, and useMemo keeps the same object for the whole life of the mesh.
  const uTime = useMemo(() => ({ value: 0 }), []);

  // Runs every frame: copy the clock into the uniform so the shadows drift.
  useFrame((state) => {
    uTime.value = state.clock.elapsedTime;
  });

  // Three builds Lambert's shader from text. onBeforeCompile lets us edit
  // that text once, just before it compiles, and keep everything else.
  const onBeforeCompile = (shader) => {
    // Hand our time uniform to the shader under the name uCsTime.
    shader.uniforms.uCsTime = uTime;

    // VERTEX shader: work out each vertex's world x/z and pass it on.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vCsWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vCsWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );

    // FRAGMENT shader: declare the same varying and the time uniform, paste in
    // the shared shadow function, then darken the lit colour with it.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
  varying vec2 vCsWorld;
  uniform float uCsTime;

  ${CLOUD_SHADOW_GLSL}

  // Far-hill grass: brightness + colour variation
  // that looks like distant grass streaks.
  // Returns a colour multiplier; vec3(1.0) = no change.
  vec3 farGrassMul(vec2 xz, float dist) {
    // Detail appears as the real grass blades fade away.
    float far = smoothstep(14.0, 48.0, dist);

    // Fine, narrow streaks.
    float streakMid = csNoise(
      vec2(xz.x * 7.0, xz.y * 1.1)
    );

    // Broad patches for distant tufts.
    float streakFar = csNoise(
      vec2(xz.x * 2.2, xz.y * 0.5)
    );

    // Reduce fine detail at longer distances to prevent shimmer.
    float midAmt =
      far * (1.0 - smoothstep(55.0, 95.0, dist));

    // Subtle variation in brightness.
    float v =
      (streakMid - 0.5) * midAmt * 0.45
      + (streakFar - 0.5) * far * 0.35;

    // Warm and cool grass tones.
    vec3 warm = vec3(1.06, 1.03, 0.94);
    vec3 cool = vec3(0.94, 0.99, 1.02);

    vec3 tone = mix(cool, warm, streakFar);

    // Fade the colour variation in with distance.
    return mix(vec3(1.0), tone, far) * (1.0 + v);
  }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `outgoingLight *= farGrassMul(vCsWorld, length(vCsWorld - cameraPosition.xz));
        outgoingLight *= cloudShadeMul(vCsWorld, uCsTime);
        #include <opaque_fragment>`,
      );
  };

  return (
    <>
      {/* Fog: starts 35 units away, fully HORIZON_COLOR at 130. */}
      <fog attach="fog" args={[HORIZON_COLOR, 35, 130]} />

      <mesh geometry={geometry}>
        <meshLambertMaterial vertexColors onBeforeCompile={onBeforeCompile} />
      </mesh>
    </>
  );
}
