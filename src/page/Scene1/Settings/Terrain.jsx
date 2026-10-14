import { useMemo } from "react";
import * as THREE from "three";
import { terrainHeight, WATER_LEVEL } from "./TerrainHeight";

// Terrain: one big mesh whose heights come from terrainHeight(x, z).
// Cost: ~28k vertices, one draw call, one cheap Lambert material.
// The meadow detail (grass, flowers) is NOT here; it comes from instanced
// objects in later steps. This mesh is just the coloured ground + the fog.

export const HORIZON_COLOR = "#E0F3FF";

// Palette sampled from the reference image.
//const GRASS_DEEP = new THREE.Color("#526e13"); // foreground grass
//const GRASS_LIGHT = new THREE.Color("#80a241"); // sunlit hills
//const MUD = new THREE.Color("#959272"); // bank at the lake shore

const GRASS_DEEP = new THREE.Color("#526B24");
const GRASS_LIGHT = new THREE.Color("#A0B957");
const MUD = new THREE.Color("#A29A78");

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
      

      // Muddy band right around the waterline.
      const shore =
        1 - THREE.MathUtils.smoothstep(y, WATER_LEVEL, WATER_LEVEL + 0.18);
      c.lerp(MUD, shore);

      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return g;
  }, []);

  return (
    <>
      {/* Fog: starts 35 units away, fully HORIZON_COLOR at 130. */}
      <fog attach="fog" args={[HORIZON_COLOR, 35, 130]} />

      <mesh geometry={geometry}>
        <meshLambertMaterial vertexColors />
      </mesh>
    </>
  );
}
