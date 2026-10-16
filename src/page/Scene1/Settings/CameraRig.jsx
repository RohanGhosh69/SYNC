import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "../../../state/motion";

// CameraRig: moves the R3F camera along a fixed path as the user scrolls.

// Where the door stands. Everything else is measured from this.
const DOOR = new THREE.Vector3(0, 0, -44);
const DOOR_HEIGHT = 6;
const FLY_DIST = 16; // how far the camera glides at the end

// Camera path: start = the reference POV (low, door small in the distance),
// end = close-up of the door. The middle points just shape a gentle rise.
const CAMERA_POINTS = [
  [0, 2.5, 0], // start POV
  [0, 2.8, -14],
  [0, 3.4, -26],
  [0, 4.0, -32], // close-up, ~12 units from the door
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

// Where the camera is looking: starts slightly low, ends at the door's middle.
const LOOK_START = new THREE.Vector3(0, 2.0, DOOR.z);
const LOOK_END = new THREE.Vector3(0, 3.0, DOOR.z);

// Built once at module load (not every frame, not every render).
const path = new THREE.CatmullRomCurve3(CAMERA_POINTS);
const look = new THREE.Vector3(); // reused each frame so we don't allocate

export default function CameraRig() {
  // useFrame runs once per rendered frame, right before three draws.
  useFrame((state) => {
    // Clamp so tiny overshoots from Lenis can never push us off the path.
    const t = THREE.MathUtils.clamp(motion.progress, 0, 1);

    // getPointAt = equal distance per step, so scroll speed feels constant.
    path.getPointAt(t, state.camera.position);

    look.lerpVectors(LOOK_START, LOOK_END, t);

    // Fly-through (0..1): glide forward past the door.
    const f = motion.fly;
    if (f > 0) {
      state.camera.position.z -= f * FLY_DIST;
      state.camera.position.y += (LOOK_END.y - state.camera.position.y) * f; // settle to door-middle height
      look.z -= f * 30; // keep looking ahead, never back at the door
    }
    state.camera.lookAt(look);
  });

  return DEBUG ? <DebugMarkers /> : null;
}

// This provides GRID.
const DEBUG = true;

function DebugMarkers() {
  return (
    <group>
      {/* Floor grid: 2-unit squares, pink centre line along the path 
      <gridHelper args={[200, 100, "#ff5fa2", "#2a2f55"]} position={[0, 0, -50]} />
      */}

      {/* Door stand-in: 3.7 wide x 6 tall, matching the reference proportions */}
      <mesh position={[DOOR.x, DOOR_HEIGHT / 2, DOOR.z]}>
        <boxGeometry args={[3.7, DOOR_HEIGHT, 0.6]} />
        <meshBasicMaterial color="#f4a3b5" />
      </mesh>
    </group>
  );
}
