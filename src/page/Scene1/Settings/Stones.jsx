import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight } from "./TerrainHeight";

// Update this path to match your rock model's location.
const MODEL_PATH = "/model/stone.glb";

const ROCK_COUNT = 25;

// Lake coordinates from TerrainHeight.js
const LAKE = {
  x: -0.5,
  z: -14.5,
  rx: 4,
  rz: 8,
};

// ─────────────────────────────────────────────────────────────
// Deterministic random generator
// Gives each rock variation without changing positions on render.
// ─────────────────────────────────────────────────────────────

function seededRandom(seed) {
  let value = seed;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// ─────────────────────────────────────────────────────────────
// Rock placement
// ─────────────────────────────────────────────────────────────

function createRockLayout() {
  const random = seededRandom(2468);
  const rocks = [];

  // Selected shoreline clusters.
  // Gaps between clusters keep the lake looking natural.

  const shorelineClusters = [
    { start: 2.0, end: 2.95, count: 5 },
    { start: 3.35, end: 4.15, count: 4 },
    { start: 4.65, end: 5.45, count: 4 },
    { start: 5.8, end: 6.7, count: 3 },
  ];

  shorelineClusters.forEach((cluster) => {
    for (let i = 0; i < cluster.count; i++) {
      const progress = cluster.count === 1 ? 0.5 : i / (cluster.count - 1);

      const angle =
        cluster.start +
        (cluster.end - cluster.start) * progress +
        (random() - 0.5) * 0.12;

      // Keep rocks near the shore, outside most of the lake basin.
      const radius = 1.12 + random() * 0.13;

      const x = LAKE.x + Math.cos(angle) * LAKE.rx * radius;

      const z = LAKE.z + Math.sin(angle) * LAKE.rz * radius;

      rocks.push({
        x,
        z,
        scale: [
          0.2 + random() * 0.55,
          0.2 + random() * 0.4,
          0.2 + random() * 0.55,
        ],
        rotation: random() * Math.PI * 2,
        tilt: (random() - 0.5) * 0.16,
      });
    }
  });

  // Scattered landscape rocks.
  // Keep the central approach to the pink door relatively clear.

  const groundPositions = [
    [-7.5, -7],
    [7, -10],
    [-8, -22],
    [9, -25],
    [-11, -31],
    [11, -36],
    [-8, -52],
    [9, -57],
    [-14, -64],
    [13, -70],
    [-10, -79],
  ];

  groundPositions.forEach(([x, z]) => {
    rocks.push({
      x,
      z,
      scale: [
        0.2 + random() * 0.55,
        0.2 + random() * 0.4,
        0.2 + random() * 0.55,
      ],
      rotation: random() * Math.PI * 2,
      tilt: (random() - 0.5) * 0.16,
    });
  });

  return rocks.slice(0, ROCK_COUNT);
}

// Stone skake concept
function InteractiveRock({ object, position, rotation, scale }) {
  const rockRef = useRef();
  const shake = useRef({
    active: false,
    time: 0,
    duration: 0.4,
    strength: 0.12,
  });

  const triggerShake = (event) => {
    event.stopPropagation();

    shake.current.active = true;
    shake.current.time = 0;
  };

  useFrame((_, delta) => {
    const group = rockRef.current;
    if (!group) return;

    const state = shake.current;

    if (!state.active) return;

    state.time += delta;

    const progress = Math.min(state.time / state.duration, 1);

    // Quickly fade the shaking out
    const fade = 1 - progress;

    // Several quick side-to-side movements
    group.rotation.z =
      rotation[2] + Math.sin(state.time * 55) * state.strength * fade;

    group.rotation.x =
      rotation[0] + Math.sin(state.time * 42) * state.strength * 0.5 * fade;

    if (progress >= 1) {
      state.active = false;
      group.rotation.set(...rotation);
    }
  });

  return (
    <group
      ref={rockRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={triggerShake}
    >
      <primitive object={object} />
    </group>
  );
}

// Stone component
export default function Stone(props) {
  const { scene } = useGLTF(MODEL_PATH);

  const rocks = useMemo(() => createRockLayout(), []);

  // Normalize the model so its largest dimension is approximately 1.
  // This allows the per-rock scale values to remain predictable.
  const model = useMemo(() => {
    const clone = scene.clone(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const largestDimension = Math.max(size.x, size.y, size.z);

    if (largestDimension > 0) {
      clone.scale.multiplyScalar(1 / largestDimension);
    }

    // Center horizontally and place the bottom at local Y = 0.
    const normalizedBox = new THREE.Box3().setFromObject(clone);

    clone.position.x -= (normalizedBox.min.x + normalizedBox.max.x) / 2;

    clone.position.z -= (normalizedBox.min.z + normalizedBox.max.z) / 2;

    clone.position.y -= normalizedBox.min.y;

    return clone;
  }, [scene]);

  return (
    <group {...props}>
      {rocks.map((rock, index) => (
        <InteractiveRock
          key={index}
          object={model.clone(true)}
          position={[rock.x, terrainHeight(rock.x, rock.z), rock.z]}
          rotation={[
            rock.tilt,
            rock.rotation,
            (index % 2 === 0 ? 1 : -1) * rock.tilt,
          ]}
          scale={rock.scale}
        />
      ))}
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
