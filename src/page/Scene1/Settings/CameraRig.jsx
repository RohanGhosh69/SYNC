import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "../../../state/motion";

// CameraRig: moves the R3F camera along a fixed path as the user scrolls.

// Where the door stands. Everything else is measured from this.
const DOOR = new THREE.Vector3(0, 0, -44);
const DOOR_HEIGHT = 6;
const FLY_DIST = 16; // how far the camera glides at the end

// Lightweight materials for the procedural door.

/// Lightweight materials for the procedural door.

// Frame — Clean soft pinkish white
const FRAME_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#F8C8DC", // Lavender blush / soft white-pink
  //roughness: 0.35,
  metalness: 0.0,
});

// Entire door — Vibrant soft light pink
const DOOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#F8C8DC", // True Light Pink
  //roughness: 0.35,
  metalness: 0.0,
});

// Door panels — Lighter pastel blush pink
const PANEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#F8C8DC", // Soft Pastel Pink
 // roughness: 0.3,
  metalness: 0.0,
});

// Decorative trim — Bright soft white
const TRIM_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#F8C8DC",
  metalness: 0.0,
});

// Handle — Warm light satin gold
const GOLD_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#F4D068",
  roughness: 0.25,
  metalness: 0.7,
});
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

function DoorBox({ position, size, material }) {
  return (
    <mesh
      position={position}
      material={material}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={size} />
    </mesh>
  );
}

function InsetPanel({
  y,
  borderHeight,
  centerHeight,
  halfY,
  leafWidth,
  leafDepth,
}) {
  const z = leafDepth / 2 + 0.018;
  const borderWidth = 2.28;
  const sideX = 1.112;

  return (
    <group position={[leafWidth / 2, y, z]}>
      {[
        { position: [0, halfY, 0], size: [borderWidth, 0.055, 0.035] },
        { position: [0, -halfY, 0], size: [borderWidth, 0.055, 0.035] },
        { position: [-sideX, 0, 0], size: [0.055, borderHeight, 0.035] },
        { position: [sideX, 0, 0], size: [0.055, borderHeight, 0.035] },
      ].map((part, i) => (
        <DoorBox key={i} {...part} material={TRIM_MATERIAL} />
      ))}
      <DoorBox
        position={[0, 0, -0.006]}
        size={[2.15, centerHeight, 0.018]}
        material={PANEL_MATERIAL}
      />
    </group>
  );
}

function DebugMarkers() {
  const frameWidth = 3.7;
  const postWidth = 0.24;
  const frameDepth = 0.34;
  const leafWidth = 3.05;
  const leafHeight = 5.56;
  const leafDepth = 0.14;
  const leafBaseY = 0.14;
  const hingeX = DOOR.x - leafWidth / 2;
  const openAngle = THREE.MathUtils.degToRad(24);

  const frameParts = [
    {
      position: [
        DOOR.x - frameWidth / 2 + postWidth / 2,
        DOOR_HEIGHT / 2,
        DOOR.z,
      ],
      size: [postWidth, DOOR_HEIGHT, frameDepth],
    },
    {
      position: [
        DOOR.x + frameWidth / 2 - postWidth / 2,
        DOOR_HEIGHT / 2,
        DOOR.z,
      ],
      size: [postWidth, DOOR_HEIGHT, frameDepth],
    },
    {
      position: [DOOR.x, DOOR_HEIGHT - 0.14, DOOR.z],
      size: [frameWidth, 0.28, frameDepth],
    },
    {
      position: [DOOR.x, 0.07, DOOR.z + 0.025],
      size: [frameWidth, 0.14, 0.42],
    },
  ];

  const panels = [
    { y: 4.35, borderHeight: 1.48, centerHeight: 1.35, halfY: 0.72 },
    { y: 1.72, borderHeight: 1.85, centerHeight: 1.72, halfY: 0.91 },
  ];

  return (
    <group>
      {frameParts.map((part, i) => (
        <DoorBox key={`frame-${i}`} {...part} material={FRAME_MATERIAL} />
      ))}

      {[-1.49, 1.49].map((x) => (
        <DoorBox
          key={`trim-${x}`}
          position={[DOOR.x + x, DOOR_HEIGHT / 2 - 0.07, DOOR.z + 0.19]}
          size={[0.045, DOOR_HEIGHT - 0.52, 0.035]}
          material={TRIM_MATERIAL}
        />
      ))}

      <group
        position={[hingeX, leafBaseY, DOOR.z + 0.19]}
        rotation={[0, openAngle, 0]}
      >
        <DoorBox
          position={[leafWidth / 2, leafHeight / 2, 0]}
          size={[leafWidth, leafHeight, leafDepth]}
          material={DOOR_MATERIAL}
        />

        {panels.map((panel, i) => (
          <InsetPanel
            key={i}
            {...panel}
            y={panel.y - leafBaseY}
            leafWidth={leafWidth}
            leafDepth={leafDepth}
          />
        ))}

        <mesh
          position={[leafWidth - 0.27, 2.85 - leafBaseY, leafDepth / 2 + 0.075]}
          material={GOLD_MATERIAL}
          castShadow={false}
          receiveShadow={false}
        >
          <sphereGeometry args={[0.09, 8, 6]} />
        </mesh>
        <DoorBox
          position={[leafWidth - 0.27, 2.85 - leafBaseY, leafDepth / 2 + 0.035]}
          size={[0.12, 0.22, 0.04]}
          material={GOLD_MATERIAL}
        />
        {/* Black plane behind the door */}
        <mesh position={[1.7, DOOR_HEIGHT / 2, -0.2]}>
          <planeGeometry args={[4.0, DOOR_HEIGHT - 0.4]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
