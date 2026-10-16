import { MathUtils } from "three";

// terrainHeight(x, z) → ground height (y) at that spot.
// ONE function describes the whole landscape. Everything that needs the ground shares it, so nothing ever floats or sinks:

const smooth = MathUtils.smoothstep; // smooth(x, min, max) → 0..1 S-curve

// Keep in sync with DOOR in CameraRig.jsx (we will make it one source later).
export const DOOR_POS = { x: 0, z: -44 };

// The lake: an ellipse centred just left of the path, 9 to 20 units ahead
// (measured from the reference: near shore ~9, far shore ~20).
export const LAKE = { x: -0.5, z: -14.5, rx: 4, rz: 8, depth: -1.1 };
export const WATER_LEVEL = -0.3; // water surface height (lake mesh comes later)

// Soft rolling bumps from three sine waves. Cheap stand-in for noise.
function rolling(x, z) {
  return (
    Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 + 0.6) +
    Math.sin(x * 0.11 + z * 0.07 + 2.1) * 0.5 +
    Math.cos(x * 0.19 - z * 0.13) * 0.22
  );
}

export function terrainHeight(x, z) {
  const ahead = -z; // how far in front of the start we are (grows as we go forward)

  // How "far away" this spot is: 0 near us, 1 in the far hills.
  const far = smooth(ahead, 30, 120);

  // Lake coordinates: d < 1 is inside the ellipse, d = 1 is its rim.
  const d = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);

  // 1. Rolling bumps. Kept flat near the start (we stand there) and near
  //    the lake (so the shoreline stays clean); livelier in the distance.
  const calm = smooth(Math.hypot(x, z), 0, 20) * smooth(d, 0.8, 1.6);
  let h = rolling(x, z) * 0.45 * calm * (1 + 1.5 * far);

  // 2. Side banks: ground rises to the right (higher) and left (lower),
  //    like the reference where the right slope carries the big tree.
  h += 5.0 * smooth(x, 3, 30) + 3.0 * smooth(-x, 3, 30);

  // 3. Far hills: a ridge line behind the door, with slow variation along x.
  h += 5.0 * far * (0.7 + 0.3 * Math.sin(x * 0.05 + 1.1));

  // 4. Flat pad under the door so it stands level at y = 0.
  const pad = 1 - smooth(Math.hypot(x - DOOR_POS.x, z - DOOR_POS.z), 4, 14);
  h *= 1 - pad;

  // 5. Lake basin: carve a smooth bowl. Applied last so nothing refills it.
  h += LAKE.depth * (1 - smooth(d, 0.55, 1.15));

  return h;
}
