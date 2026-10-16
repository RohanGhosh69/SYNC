import { Suspense, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const ASSET_DIR = "/images/clouds/";
const IMAGE_ASPECT = 1678 / 937;

// Slower movement and positioning suited to your landscape.
const CLOUDS = [
  {
    file: "cloud_1.webp",
    depth: 120,
    x: -35,
    elev: 12,
    size: 0.5,
    speed: 0.15,
  },
  {
    file: "cloud_2.webp",
    depth: 150,
    x: 60,
    elev: 9,
    size: 0.45,
    speed: 0.2,
  },
];

const VISIBLE_HALF_WIDTH = 0.7;
const DEG = Math.PI / 180;

// ─────────────────────────────────────────────
// Individual cloud
// ─────────────────────────────────────────────

function Cloud({ texture, config }) {
  const ref = useRef();
  const [isSmall, setIsSmall] = useState(false);

  const width = config.depth * config.size;
  const height = width / IMAGE_ASPECT;

  const limit = config.depth * VISIBLE_HALF_WIDTH + width / 2;

  // Preserve the original dimensions and animate only the scale.
  const targetScale = useRef(1);

  const originalPosition = [
    config.x,
    config.depth * Math.tan(config.elev * DEG),
    -config.depth,
  ];

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;

    // Slow, frame-rate-independent horizontal drift.
    mesh.position.x += config.speed * Math.min(delta, 0.05);

    // Re-enter from the left after leaving the right edge.
    if (mesh.position.x > limit) {
      mesh.position.x = -limit;
    }

    // Smoothly animate between 100% and 50% scale.
    const target = targetScale.current;

    mesh.scale.setScalar(
      THREE.MathUtils.damp(
        mesh.scale.x,
        target,
        5,
        Math.min(delta, 0.05)
      )
    );
  });

  const handleTap = (event) => {
    event.stopPropagation();

    const nextSmall = !isSmall;

    setIsSmall(nextSmall);
    targetScale.current = nextSmall ? 0.5 : 1;
  };

  return (
    <mesh
      ref={ref}
      position={originalPosition}
      renderOrder={-1}
      onClick={handleTap}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <planeGeometry args={[width, height]} />

      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        fog={false}
        side={THREE.DoubleSide}
        opacity={0.65}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────
// Cloud layer
// ─────────────────────────────────────────────

function CloudLayer() {
  const textures = useTexture(
    CLOUDS.map((cloud) => ASSET_DIR + cloud.file)
  );

  return CLOUDS.map((config, index) => (
    <Cloud
      key={config.file}
      texture={textures[index]}
      config={config}
    />
  ));
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

export default function Clouds() {
  return (
    <Suspense fallback={null}>
      <CloudLayer />
    </Suspense>
  );
}