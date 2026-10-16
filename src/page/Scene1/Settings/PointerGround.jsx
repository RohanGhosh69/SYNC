import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight, WATER_LEVEL } from "../Environment/TerrainHeight";

// ─────────────────────────────────────────────────────────────
// PointerGround: turns "where is the mouse on screen" into
// "which spot on the ground is the mouse pointing at".
//
// It writes into the shared `ground` object below. Grass, flowers, water and
// clouds will all READ that object every frame (as a shader uniform), so
// they can react to the cursor without any per-object raycasting.
//
// v2: instead of a flat plane, the ray is walked across the real terrain
// (terrainHeight) and stops where it first goes underground. Over the lake it
// stops at the water surface, so ripples will start at the right height.
// ─────────────────────────────────────────────────────────────

// Shared, mutable, NOT React state: updating it never re-renders anything.
export const ground = {
  point: new THREE.Vector3(), // world position of the cursor on the ground / water surface
  active: false, // true only when the mouse is over the ground this frame
  onWater: false, // true when that point is over the lake
  speed: 0, // smoothed mouse speed, screen-space units per second
};

// Ray-march settings. The ray is walked in steps that grow with distance
// (near the camera we need precision, far away we don't).
const MAX_DISTANCE = 120; // ignore anything further than this along the ray
const STEP_MIN = 0.4; // first step size
const STEP_GROW = 0.02; // step grows by 2% of the distance travelled
const REFINE_STEPS = 6; // bisection passes to pin down the exact hit

// Module-level scratch objects: created once, reused every frame.
const ndc = new THREE.Vector2(); // mouse in -1..1 screen coordinates
const raycaster = new THREE.Raycaster();
const hit = new THREE.Vector3();

let hasPointer = false; // false until the mouse has moved over the page
let moved = 0; // mouse travel since the last frame (in -1..1 units)

// The visible surface: the ground, or the water if the ground is below it.
function surfaceHeight(x, z) {
  return Math.max(terrainHeight(x, z), WATER_LEVEL);
}

// Point on the ray at distance t, written into `hit`.
function pointAt(ray, t) {
  return hit.copy(ray.direction).multiplyScalar(t).add(ray.origin);
}

export default function PointerGround() {
  const marker = useRef();

  // Listen on window, not on the canvas. The DOM text layer sits on top of
  // the canvas, so canvas-only events would stop working once we add content.
  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1; // screen Y points down, 3D Y points up
      if (hasPointer) moved += Math.hypot(x - ndc.x, y - ndc.y);
      ndc.set(x, y);
      hasPointer = true;
    };
    const onLeave = () => {
      hasPointer = false; // mouse left the browser window
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useFrame((state, delta) => {
    // 1. Mouse speed, smoothed so a single twitchy frame doesn't spike it.
    const raw = moved / Math.max(delta, 1e-4);
    moved = 0;
    ground.speed = THREE.MathUtils.damp(ground.speed, raw, 8, delta);

    // 2. Find where the mouse ray meets the terrain. Redone every frame, even
    //    if the mouse is still, because the camera moves with scroll.
    ground.active = false;
    if (hasPointer) {
      state.camera.updateMatrixWorld(); // make sure the camera's latest move is used
      raycaster.setFromCamera(ndc, state.camera);
      const ray = raycaster.ray;

      // 2a. Walk forward until the ray first goes below the surface.
      let lo = 0; // last distance where the ray was still above ground
      let hi = -1; // first distance where it was below ground (-1 = never)
      for (let t = STEP_MIN; t < MAX_DISTANCE; t += STEP_MIN + t * STEP_GROW) {
        pointAt(ray, t);
        if (hit.y <= surfaceHeight(hit.x, hit.z)) {
          hi = t;
          break;
        }
        lo = t;
      }

      // 2b. The hit lies between lo and hi. Halve that gap a few times
      //     (bisection) to pin it down without taking tiny steps.
      if (hi > 0) {
        for (let i = 0; i < REFINE_STEPS; i++) {
          const mid = (lo + hi) / 2;
          pointAt(ray, mid);
          if (hit.y <= surfaceHeight(hit.x, hit.z)) hi = mid;
          else lo = mid;
        }
        pointAt(ray, hi);
        ground.point.copy(hit);
        ground.onWater = terrainHeight(hit.x, hit.z) < WATER_LEVEL;
        ground.active = true;
      }
    }

    // 3. Debug ring follows the point (see DEBUG below).
    const m = marker.current;
    if (m) {
      m.visible = ground.active;
      if (ground.active) {
        m.position.set(ground.point.x, ground.point.y + 0.05, ground.point.z);
        // Grow with distance so it stays visible far away.
        m.scale.setScalar(
          Math.max(1, state.camera.position.distanceTo(ground.point) * 0.04),
        );
        // Brighter when the mouse moves fast, so you can see `speed` working.
        m.material.opacity = THREE.MathUtils.clamp(
          0.35 + ground.speed * 0.25,
          0.35,
          1,
        );
        // White on land, cyan over the lake.
        m.material.color.set(ground.onWater ? "#46d9ff" : "#ffffff");
      }
    }
  });

  return DEBUG ? (
    <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.8, 1, 40]} />
      <meshBasicMaterial color="#ffffff" transparent side={THREE.DoubleSide} />
    </mesh>
  ) : null;
}

// TEMPORARY: the ring that shows the ground point. Set to false
// (or delete the marker) once real objects react to the cursor.
const DEBUG = true;
