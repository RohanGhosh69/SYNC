import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, DoubleSide } from "three";
import { motion } from "../../../state/motion";

// ---- Tuning knobs ----
const DOOR_POS = [0, 0, -45]; // Keep aligned with the door's bottom centre.
const START = 0.42; // Scroll progress where fog begins to appear.

// back = distance behind the door, w/h = plane size, o = max opacity
const LAYERS = [
  { back: 3, w: 110, h: 34, o: 0.60 },
  { back: 12, w: 180, h: 52, o: 0.54 },
];

function makeTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");

  const col = g.createLinearGradient(0, 0, 0, S);

  col.addColorStop(0, "#DCE8EE"); // Cool mist near the sky
  col.addColorStop(0.32, "#EEE5C9"); // Warm pale sunlight
  col.addColorStop(0.68, "#F4D69A"); // Golden-yellow haze
  col.addColorStop(1, "#F0B96F"); // Yellow-orange ground mist

  g.fillStyle = col;
  g.fillRect(0, 0, S, S);

  // Feather the left/right edges, with dense mist near ground level.
  g.globalCompositeOperation = "destination-in";
  const h = g.createLinearGradient(0, 0, S, 0);
  h.addColorStop(0, "rgba(0,0,0,0)");
  h.addColorStop(0.12, "rgba(0,0,0,0.55)");
  h.addColorStop(0.28, "rgba(0,0,0,0.96)");
  h.addColorStop(0.72, "rgba(0,0,0,0.96)");
  h.addColorStop(0.88, "rgba(0,0,0,0.55)");
  h.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = h;
  g.fillRect(0, 0, S, S);

  const v = g.createLinearGradient(0, S, 0, 0);

  v.addColorStop(0, "rgba(0,0,0,1)");
  v.addColorStop(0.24, "rgba(0,0,0,0.98)");
  v.addColorStop(0.58, "rgba(0,0,0,0.76)");
  v.addColorStop(0.82, "rgba(0,0,0,0.34)");
  v.addColorStop(1, "rgba(0,0,0,0.08)");

  // Break up the upper edge with subtle irregular wisps.
  g.globalCompositeOperation = "destination-out";
  let seed = 17;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 38; i++) {
    const x = random() * S;
    const y = S * (0.1 + random() * 0.62);
    const rx = S * (0.035 + random() * 0.09);
    const ry = S * (0.015 + random() * 0.035);
    const gradient = g.createRadialGradient(x, y, 0, x, y, rx);
    gradient.addColorStop(0, `rgba(0,0,0,${0.12 + random() * 0.24})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.fillStyle = gradient;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export default function EndHaze() {
  const refs = useRef([]);
  const tex = useMemo(makeTexture, []);

  useFrame(() => {
    const progress = Number(motion.progress) || 0;
    const t = Math.min(1, Math.max(0, (progress - START) / (1 - START)));
    const a = t * t * (3 - 2 * t);
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = a > 0.001;
      m.material.opacity = a * LAYERS[i].o;
    });
  });

  return (
    <>
      {LAYERS.map((L, i) => (
        <mesh
          key={i}
          ref={(m) => (refs.current[i] = m)}
          position={[
            DOOR_POS[0],
            DOOR_POS[1] - 2 + L.h / 2,
            DOOR_POS[2] - L.back,
          ]}
          visible={false}
          renderOrder={10 + i}
        >
          <planeGeometry args={[L.w, L.h]} />
          <meshBasicMaterial
            map={tex}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            fog={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}
