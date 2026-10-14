import { Suspense, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ground } from "./PointerGround";
import { terrainHeight, WATER_LEVEL } from "./TerrainHeight";

// ─────────────────────────────────────────────────────────────
// Flowers: two instanced layers, one draw call each.
//   WHITE: a small cluster of 5 tiny flowers is ONE instance (so 14k instances
//          = 70k flowers). They bunch together in patches, like the reference.
//   PINK : one tall flower per instance, a few much taller than the rest.
// Same ideas as Grass.jsx: positions from terrainHeight, baked ground shading,
// wind + distance fade in the vertex shader. New here: when the cursor is on
// the ground, nearby flowers LEAN TOWARD it and GLOW brighter.
// ─────────────────────────────────────────────────────────────

const WHITE_COUNT = 5500; // clusters. Lower this first if the integrated GPU struggles.
const WIND = 0.07; // sway strength
const FADE_START = 20; // flowers start shrinking/thinning this far from the camera...
const FADE_END = 62; // ...and are all gone by here

// The 3 GLB flowers. Every model is 1 unit tall, so `height` is the average height in world units.
const GLB_URL = "/model/flowers.glb";
const COLOR_FLOWERS = [
  {
    node: "flower_purple",
    cutout: true,
    count: 1800,
    seed: 47,
    spread: 20,
    patchPow: 2,
    patchOffset: [-17, 21],
    height: 0.45,
    glow: "#e2b8ff",
  },
  {
    node: "flower_red",
    cutout: true,
    count: 1000,
    seed: 59,
    spread: 18,
    patchPow: 2,
    patchOffset: [29, 11],
    height: 0.55,
    glow: "#ff8a8a",
  },
];
const COLOR_WIND = WIND * 1.6; // wind and lean are fractions of the flower's height, so these are tuned for 1-unit models
const COLOR_LEAN = 0.4;
const COLOR_RADIUS = 3.2;

// Same field box and camera path as Grass.jsx.
const REGION = { x0: -45, x1: 45, z0: 8, z1: -80 };
const PATH_END_Z = -32;

// Same lighting numbers Grass.jsx bakes into the ground shading.
const AMBIENT = 1.4;
const SUN_INTENSITY = 3.1;
const SUN_DIR = new THREE.Vector3(3, 4, 5).normalize();

// Seeded random: same flowers on every reload.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1 on the camera path, falling off with distance (bigger spread = wider field).
function pathDensity(x, z, spread) {
  const zc = THREE.MathUtils.clamp(z, PATH_END_Z, 0);
  const d = Math.hypot(x, z - zc);
  return 1 / (1 + (d / spread) * (d / spread));
}

// Soft patches (0.25..1): flowers bunch up in some places and thin out in others.
function patchWeight(x, z) {
  const p1 = 0.5 + 0.5 * Math.sin(x * 0.21 + 1.7) * Math.cos(z * 0.17 - 0.9);
  const p2 = 0.5 + 0.5 * Math.sin(x * 0.53 - z * 0.41 + 2.0);
  const p = 0.65 * p1 + 0.35 * p2;
  return 0.25 + 0.75 * THREE.MathUtils.smoothstep(p, 0.3, 0.7);
}

// Ground brightness (same maths as Grass.jsx) plus how flat the ground is.
const _n = new THREE.Vector3();
function groundInfo(x, z) {
  const e = 0.6;
  _n.set(
    terrainHeight(x - e, z) - terrainHeight(x + e, z),
    2 * e,
    terrainHeight(x, z - e) - terrainHeight(x, z + e),
  ).normalize();
  const sun = Math.max(0, _n.dot(SUN_DIR));
  return { shade: (AMBIENT + SUN_INTENSITY * sun) / Math.PI, flat: _n.y };
}

// Where every instance goes, plus its random size / yaw.
function scatter({
  count,
  seed,
  spread,
  patchPow,
  patchOffset = [0, 0],
  makeParams,
}) {
  const rand = mulberry32(seed);
  const offsets = new Float32Array(count * 3);
  const params = new Float32Array(count * 4); // scale, yaw, random 0..1, spare
  const shade = new Float32Array(count);

  let n = 0;
  let tries = 0;
  while (n < count && tries < count * 80) {
    tries++;
    const x = THREE.MathUtils.lerp(REGION.x0, REGION.x1, rand());
    const z = THREE.MathUtils.lerp(REGION.z0, REGION.z1, rand());

    // Cheap tests first: path distance and patches.
    if (
      rand() >
      pathDensity(x, z, spread) *
        Math.pow(patchWeight(x + patchOffset[0], z + patchOffset[1]), patchPow)
    )
      continue;

    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 0.06) continue; // keep roots out of the lake

    // Flowers like slopes a little: flat ground keeps 60%, slopes keep 100%.
    const info = groundInfo(x, z);
    if (rand() > 0.6 + 0.4 * Math.min(1, (1 - info.flat) * 10)) continue;

    offsets.set([x, y, z], n * 3);
    params.set(makeParams(rand), n * 4);
    shade[n] = info.shade;
    n++;
  }
  return { offsets, params, shade, count: n };
}

// ---- Flower geometry (built once, in plain arrays) --------------------
// Each flower = a thin stem quad + a flat star-shaped head (a fan of triangles).
// aTone tells the shader which part a vertex belongs to:
//   0..0.2 stem, 0.55 head centre, 0.8 notch between petals, 1.0 petal tip.
function buildFlowerGeometry(flowers, petals) {
  const pos = [];
  const tone = [];
  const index = [];
  let maxY = 0;

  const addV = (x, y, z, t) => {
    pos.push(x, y, z);
    tone.push(t);
    if (y > maxY) maxY = y;
    return pos.length / 3 - 1;
  };

  for (const f of flowers) {
    const topX = f.x + f.dx;
    const topZ = f.z + f.dz;

    // Stem: 4 vertices, 2 triangles.
    const hw = f.stemW / 2;
    const s0 = addV(f.x - hw, 0, f.z, 0.0);
    const s1 = addV(f.x + hw, 0, f.z, 0.0);
    const s2 = addV(topX - hw * 0.6, f.h, topZ, 0.2);
    const s3 = addV(topX + hw * 0.6, f.h, topZ, 0.2);
    index.push(s0, s1, s2, s1, s3, s2);

    // Head: centre vertex + a ring that alternates tip / notch.
    const c = addV(topX, f.h, topZ, 0.55);
    const cosT = Math.cos(f.tilt);
    const sinT = Math.sin(f.tilt);
    const cosP = Math.cos(f.phi);
    const sinP = Math.sin(f.phi);
    const ring = [];
    for (let i = 0; i < petals * 2; i++) {
      const tip = i % 2 === 0;
      const a = (i * Math.PI) / petals;
      const r = f.r * (tip ? 1 : 0.5);
      // Flat disc in the XZ plane...
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      // ...tipped over around X by `tilt` (head faces up and toward +z)...
      const ty = -pz * sinT;
      const tz = pz * cosT;
      // ...then spun around Y by `phi`.
      const hx = px * cosP + tz * sinP;
      const hz = -px * sinP + tz * cosP;
      ring.push(addV(topX + hx, f.h + ty, topZ + hz, tip ? 1.0 : 0.8));
    }
    for (let i = 0; i < ring.length; i++) {
      index.push(c, ring[i], ring[(i + 1) % ring.length]);
    }
  }

  // aBend: 0 at the roots, 1 at the top. The shader squares it so roots stay
  // planted and the tips move most (same idea as the grass blades).
  const bend = new Float32Array(pos.length / 3);
  for (let i = 0; i < bend.length; i++) bend[i] = pos[i * 3 + 1] / maxY;

  return {
    position: new Float32Array(pos),
    tone: new Float32Array(tone),
    bend,
    index,
  };
}

// One white cluster = 5 tiny flowers of different heights, all inside ~13 cm.
function whiteClusterFlowers() {
  const rand = mulberry32(7);
  return Array.from({ length: 5 }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.13;
    return {
      x: Math.cos(a) * d,
      z: Math.sin(a) * d,
      h: 0.26 + rand() * 0.26,
      dx: (rand() - 0.5) * 0.05,
      dz: (rand() - 0.5) * 0.05,
      r: 0.036 + rand() * 0.014,
      tilt: 0.25 + rand() * 0.6,
      phi: rand() * Math.PI * 2,
      stemW: 0.012,
    };
  });
}

// ---- Shaders ----------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;   // where this instance stands (world)
  attribute vec4 aParams;   // x scale, y yaw, z random
  attribute float aShade;   // baked ground brightness
  #ifdef FLOWER_TEX
  varying vec2 vUv;
  varying float vH;
  #else
    attribute float aTone;
    attribute float aBend;
  #endif

  uniform float uTime;
  uniform float uWind;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uRadius;    // how far the cursor reaches
  uniform float uLean;      // how far a flower leans toward the cursor
  uniform vec3 uCursor;     // x = world x, y = world z, z = strength 0..1

  varying float vTone;
  varying float vShade;
  varying float vRand;
  varying float vGlow;

  #include <fog_pars_vertex>

  void main() {
    float sc  = aParams.x;
    float yaw = aParams.y;
    float rnd = aParams.z;

    // 1. Distance fade (same trick as the grass): fewer survive, the rest shrink.
    float dist = distance(aOffset, cameraPosition);
    float keep = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    float life = clamp((keep - rnd) * 6.0 + 1.0, 0.0, 1.0) * smoothstep(0.0, 0.1, keep);
    if (life <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen: skipped
      return;
    }

    // 2. Spin around Y, widen a little with distance, apply size.
    float c = cos(yaw);
    float s = sin(yaw);
    vec3 p = position;
    vec3 local = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    local.xz *= 1.0 + dist * 0.012; // far flowers never become sub-pixel
    local *= sc * life;

    // 3. Wind: tips move, roots stay.
    #ifdef FLOWER_TEX
    float bendH = clamp(position.y, 0.0, 1.0);
#else
    float bendH = aBend;
#endif
    float bendW = bendH * bendH;
    float wave = sin(uTime * 1.5 + aOffset.x * 0.35 + aOffset.z * 0.27 + rnd * 6.28);
    float gust = sin(uTime * 0.6 + aOffset.x * 0.07 - aOffset.z * 0.09);
    local.xz += vec2(wave * 0.6 + gust, wave * 0.35) * uWind * bendW * sc;

    // 4. Hover: lean toward the cursor, dip slightly, and pass a glow amount on.
    vec2 toC = uCursor.xy - aOffset.xz;
    float dC = length(toC);
    float hover = (1.0 - smoothstep(0.0, uRadius, dC)) * uCursor.z;
    local.xz += (toC / max(dC, 0.0001)) * hover * uLean * bendW * sc;
    local.y  -= hover * uLean * 0.35 * bendW * sc;

    vec4 mvPosition = modelViewMatrix * vec4(aOffset + local, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #ifdef FLOWER_TEX
    vUv = uv;
    vH = clamp(position.y, 0.0, 1.0);
#else
    vTone = aTone;
#endif
    vShade = aShade;
    vRand = rnd;
    vGlow = hover;

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uStemBase;
  uniform vec3 uStemTip;
  uniform vec3 uCenter;
  uniform vec3 uPetalInner;
  uniform vec3 uPetalTip;
  uniform vec3 uGlow;

  varying float vTone;
  varying float vShade;
  varying float vRand;
  varying float vGlow;

  #include <fog_pars_fragment>

  void main() {
    // Stem vs head, decided by the tone value baked into the geometry.
    float petal = smoothstep(0.35, 0.5, vTone);
    vec3 stem = mix(uStemBase, uStemTip, clamp(vTone / 0.2, 0.0, 1.0));
    vec3 head = mix(uCenter, uPetalInner, smoothstep(0.55, 0.8, vTone));
    head = mix(head, uPetalTip, smoothstep(0.8, 1.0, vTone));

    // Petals keep most of their brightness so whites stay white in shade.
    vec3 col = mix(stem * vShade, head * mix(1.0, vShade, 0.6), petal);
    col *= 0.92 + 0.16 * vRand; // small per-instance variation

    // Hover glow: brighter petals plus a soft tint.
    col = col * (1.0 + 0.35 * vGlow * petal) + uGlow * vGlow * 0.30 * petal;

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// Fragment shader for the GLB flowers: texture colour + the same shading and glow.
const texFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uGlow;

  varying vec2 vUv;
  varying float vH;
  varying float vShade;
  varying float vRand;
  varying float vGlow;

  #include <fog_pars_fragment>

  void main() {
    vec4 tex = texture2D(uMap, vUv);

  #ifdef ALPHA_CUTOUT
    if (tex.a < 0.5) discard; // hard cut-out: no blending, no sorting
  #endif

    vec3 col = tex.rgb;

    // Ground shading, softened like the white petals, plus a fake "shadow near the soil".
    col *= mix(1.0, vShade, 0.6);
    col *= mix(0.55, 1.0, smoothstep(0.0, 0.45, vH));
    col *= 0.92 + 0.16 * vRand; // per-instance variation

    // Hover glow only on the upper part (the bloom), not the stem.
    float head = smoothstep(0.4, 0.85, vH);
    col = col * (1.0 + 0.35 * vGlow * head) + uGlow * vGlow * 0.30 * head;

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---- Building one layer (geometry + material) -------------------------

function makeLayer({
  flowers,
  petals,
  scatterCfg,
  colors,
  radius,
  lean,
  cursor,
}) {
  const data = scatter(scatterCfg);
  const base = buildFlowerGeometry(flowers, petals);

  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(base.index);
  g.setAttribute("position", new THREE.BufferAttribute(base.position, 3));
  g.setAttribute("aTone", new THREE.BufferAttribute(base.tone, 1));
  g.setAttribute("aBend", new THREE.BufferAttribute(base.bend, 1));
  g.setAttribute(
    "aOffset",
    new THREE.InstancedBufferAttribute(data.offsets, 3),
  );
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(data.params, 4));
  g.setAttribute("aShade", new THREE.InstancedBufferAttribute(data.shade, 1));
  g.instanceCount = data.count;

  const m = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide, // petals and stems are flat
    fog: true,
    // Petal colours are written exactly as we want them, like the water.
    // If the whites look too harsh, set this to true.
    toneMapped: false,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWind: { value: WIND },
        uFadeStart: { value: FADE_START },
        uFadeEnd: { value: FADE_END },
        uRadius: { value: radius },
        uLean: { value: lean },
        uCursor: { value: cursor },
        uStemBase: { value: new THREE.Color(colors.stemBase) },
        uStemTip: { value: new THREE.Color(colors.stemTip) },
        uCenter: { value: new THREE.Color(colors.center) },
        uPetalInner: { value: new THREE.Color(colors.petalInner) },
        uPetalTip: { value: new THREE.Color(colors.petalTip) },
        uGlow: { value: new THREE.Color(colors.glow) },
      },
    ]),
  });
  // UniformsUtils.merge CLONES vector values, which would give each layer its own
  // copy of the cursor. Re-attach the shared one so both layers read the same.
  m.uniforms.uCursor.value = cursor;

  return { geometry: g, material: m };
}

// ---- Building the GLB flower layers ------------------------------------
// One colour = ONE scatter, but one draw call per primitive of the model
// (blue and yellow have 2: stem + head), because a draw call binds only one texture.
function makeColorLayers(scene, cursor) {
  const layers = [];

  for (const cfg of COLOR_FLOWERS) {
    const node = scene.getObjectByName(cfg.node);
    const data = scatter({
      count: cfg.count,
      seed: cfg.seed,
      spread: cfg.spread,
      patchPow: cfg.patchPow,
      patchOffset: cfg.patchOffset,
      // scale = height (model is 1 tall) +-30%, any yaw, random 0..1
      makeParams: (rand) => [
        cfg.height * (0.7 + 0.6 * rand()),
        rand() * Math.PI * 2,
        rand(),
        0,
      ],
    });

    // Shared by every part of this flower, so its stem and head always stand together.
    const offsets = new THREE.InstancedBufferAttribute(data.offsets, 3);
    const params = new THREE.InstancedBufferAttribute(data.params, 4);
    const shade = new THREE.InstancedBufferAttribute(data.shade, 1);

    // traverse() visits the node and its children: a Group for blue/yellow, one Mesh for purple.
    node.traverse((mesh) => {
      if (!mesh.isMesh) return;

      const src = mesh.geometry;
      const g = new THREE.InstancedBufferGeometry();
      g.setIndex(src.index);
      g.setAttribute("position", src.attributes.position);
      g.setAttribute("uv", src.attributes.uv);
      g.setAttribute("aOffset", offsets);
      g.setAttribute("aParams", params);
      g.setAttribute("aShade", shade);
      g.instanceCount = data.count;

      const tex = mesh.material.map; // the base-colour texture the GLB already loaded
      tex.anisotropy = 4; // sharper cards seen at a slant, cheap

      const m = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: texFragmentShader,
        defines: cfg.cutout
          ? { FLOWER_TEX: "", ALPHA_CUTOUT: "" }
          : { FLOWER_TEX: "" },
        side: THREE.DoubleSide,
        fog: true,
        toneMapped: false,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uWind: { value: COLOR_WIND },
            uFadeStart: { value: FADE_START },
            uFadeEnd: { value: FADE_END },
            uRadius: { value: COLOR_RADIUS },
            uLean: { value: COLOR_LEAN },
            uCursor: { value: cursor },
            uMap: { value: tex },
            uGlow: { value: new THREE.Color(cfg.glow) },
          },
        ]),
      });
      // merge() CLONES colours, vectors AND textures. Re-attach the shared originals,
      // same trap as the cursor in makeLayer (a cloned texture would be uploaded again).
      m.uniforms.uCursor.value = cursor;
      m.uniforms.uMap.value = tex;

      layers.push({ geometry: g, material: m });
    });
  }
  return layers;
}

// Component

// Loads the GLB and draws the colour flowers. It is its own component so it can
// SUSPEND (wait for the download) without hiding the rest of the meadow.
function ColorFlowers({ cursor }) {
  const { scene } = useGLTF(GLB_URL);
  const layers = useMemo(() => makeColorLayers(scene, cursor), [scene, cursor]);

  // Free our geometry and materials. The textures belong to useGLTF's cache, so we leave them.
  useEffect(() => {
    return () => {
      for (const l of layers) {
        l.geometry.dispose();
        l.material.dispose();
      }
    };
  }, [layers]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const l of layers) l.material.uniforms.uTime.value = t;
  });

  return layers.map((l, i) => (
    <mesh
      key={i}
      geometry={l.geometry}
      material={l.material}
      frustumCulled={false}
    />
  ));
}

useGLTF.preload(GLB_URL); // start downloading as soon as this file is imported

export default function Flowers() {
  const layers = useMemo(() => {
    // Shared cursor: x = world x, y = world z, z = hover strength (eased in useFrame).
    const cursor = new THREE.Vector3(0, 0, 0);

    const white = makeLayer({
      flowers: whiteClusterFlowers(),
      petals: 5,
      scatterCfg: {
        count: WHITE_COUNT,
        seed: 11,
        spread: 30, // wide: whites cover most of the meadow
        patchPow: 1, // strong patches
        makeParams: (rand) => [
          0.8 + 0.6 * rand(),
          rand() * Math.PI * 2,
          rand(),
          0,
        ],
      },
      colors: {
        stemBase: "#35551C",
        stemTip: "#6f9a3a",
        center: "#e8c14a",
        petalInner: "#f3f1e6",
        petalTip: "#ffffff",
        glow: "#fff0b8",
      },
      radius: 2.4,
      lean: 0.1,
      cursor,
    });

    return { white, cursor };
  }, []);

  // Free GPU memory if the scene unmounts.
  useEffect(() => {
    return () => {
      for (const l of [layers.white]) {
        l.geometry.dispose();
        l.material.dispose();
      }
    };
  }, [layers]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    layers.white.material.uniforms.uTime.value = t;

    // Hover strength eases in fast and out slowly, so flowers spring back gently.
    const cursor = layers.cursor;
    const target = ground.active && !ground.onWater ? 1 : 0;
    const rate = target > cursor.z ? 10 : 2.5;
    cursor.z += (target - cursor.z) * (1 - Math.exp(-delta * rate));

    if (target) {
      if (cursor.z < 0.02) {
        // First frame on the ground: snap, so nothing leans toward an old spot.
        cursor.x = ground.point.x;
        cursor.y = ground.point.z;
      } else {
        const k = 1 - Math.exp(-delta * 14); // follow the cursor with a little lag
        cursor.x += (ground.point.x - cursor.x) * k;
        cursor.y += (ground.point.z - cursor.y) * k;
      }
    }
  });

  return (
    <>
      <mesh
        geometry={layers.white.geometry}
        material={layers.white.material}
        frustumCulled={false}
      />
      <Suspense fallback={null}>
        <ColorFlowers cursor={layers.cursor} />
      </Suspense>
    </>
  );
}
