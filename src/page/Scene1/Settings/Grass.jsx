import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ground } from "./PointerGround";
import { terrainHeight, WATER_LEVEL, LAKE } from "./TerrainHeight";

// Grass: tens of thousands of grass blades drawn in ONE draw call.

// Idea : (GPU Instancing) Instead of creating a separate mesh for every blade, you tell the GPU to draw the same geometry repeatedly.Each instance receives its own data, including its position, height, width, rotation and random variation.

const COUNT = 250000; // blades. Test on an integrated GPU; lower this first if it struggles.
const WIND = 0.15; // sway strength. 0 = perfectly still grass.
const FADE_START = 14; // blades start thinning out this far from the camera...
const FADE_END = 48; // ...and are all gone by here (the terrain colour carries the far meadow)
const HEIGHT_MIN = 0.22; // shortest blade (world units; the door is 6 tall)
const HEIGHT_MAX = 0.65; // tallest blade
const WIDTH_MIN = 0.035; // finest blade, measured at the root
const WIDTH_MAX = 0.055; // widest blade
const PUSH_RADIUS = 2.2; // how wide the cursor bends the grass (world units)

const SHORE_CLUMPS = 28; // small patches of grass around the lake rim
const BLADES_PER_CLUMP = 700; // ~19,600 extra blades in total (about +2.6%)
const TOTAL = COUNT + SHORE_CLUMPS * BLADES_PER_CLUMP; // sizes the data arrays

const TIP_COLOR = "#c0b42f";// Lighter
const BASE_COLOR = "#3B5420"; // Darker

// Where blades may grow: a box around the camera path. Inside it, blades are
// packed densely near the path and thin out away from it.
const REGION = { x0: -45, x1: 45, z0: 8, z1: -80 };
const PATH_END_Z = -32; // the camera travels from z = 0 to here (see CameraRig)
const SPREAD = 20; // density halves this far from the path

const AMBIENT = 1.0;
const SUN_INTENSITY = 3.0;
const SUN_DIR = new THREE.Vector3(-6, 10, 4).normalize();

// Small seeded random generator: same grass on every reload (Math.random
// would give a different field each time, which makes tuning impossible).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How likely a blade is to exist at (x, z): 1 on the camera path, falling off.
function density(x, z) {
  const zc = THREE.MathUtils.clamp(z, PATH_END_Z, 0); // nearest point on the path
  const d = Math.hypot(x, z - zc);
  return 1 / (1 + (d / SPREAD) * (d / SPREAD));
}

// Brightness of the ground at (x, z), from its slope (same maths as a lit surface).
function groundShade(x, z) {
  const e = 0.6;
  const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z);
  const nz = terrainHeight(x, z - e) - terrainHeight(x, z + e);
  const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
  const sun = Math.max(0, n.dot(SUN_DIR));
  return (AMBIENT + SUN_INTENSITY * sun) / Math.PI;
}

function buildBlades() {
  const rand = mulberry32(2026);
  const offsets = new Float32Array(TOTAL * 3); // root position of each blade
  const params = new Float32Array(TOTAL * 4); // height, width, yaw, random 0..1
  const shade = new Float32Array(TOTAL); // baked ground brightness

  let n = 0;
  let tries = 0;
  while (n < COUNT && tries < COUNT * 40) {
    tries++;
    const x = THREE.MathUtils.lerp(REGION.x0, REGION.x1, rand());
    const z = THREE.MathUtils.lerp(REGION.z0, REGION.z1, rand());

    if (rand() > density(x, z)) continue; // thin out away from the path

    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 0.03) continue; // no grass in the lake or on the waterline

    const r = rand();
    // Grass gets shorter toward the water, so the lake stays visible.
    const shore =
      0.8 +
      0.2 *
        THREE.MathUtils.smoothstep(y, WATER_LEVEL + 0.03, WATER_LEVEL + 0.5);
    offsets.set([x, y, z], n * 3);
    params.set(
      [
        (HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * (0.6 * r + 0.4 * r * r)) *
          shore, // height
        WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * rand(), // width at the root
        rand() * Math.PI * 2, // which way the blade faces
        rand(), // random number used for variation and fading
      ],
      n * 4,
    );
    shade[n] = groundShade(x, z);
    n++;
  }

  // ---- Shore clumps: small patches of taller grass hugging the lake rim ----
  for (let k = 0; k < SHORE_CLUMPS; k++) {
    // Clump centre: a point on the lake's ellipse (rim = 1 means the rim itself),
    // just outside the waterline.
    const a = rand() * Math.PI * 2;
    const rim = 0.97 + rand() * 0.12;
    const cx = LAKE.x + Math.cos(a) * LAKE.rx * rim;
    const cz = LAKE.z + Math.sin(a) * LAKE.rz * rim;
    const clumpR = 0.5 + rand() * 0.6; // clump radius in world units

    for (let i = 0; i < BLADES_PER_CLUMP; i++) {
      // (rand() + rand() - 1) is centred on 0 and clusters toward the middle,
      // so clumps are dense in the centre and ragged at the edges.
      const ox = (rand() + rand() - 1) * clumpR;
      const oz = (rand() + rand() - 1) * clumpR;
      const x = cx + ox;
      const z = cz + oz;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 0.04) continue; // skip roots that would be underwater

      const edge = Math.min(Math.hypot(ox, oz) / clumpR, 1); // 0 centre .. 1 edge
      offsets.set([x, y, z], n * 3);
      params.set(
        [
          (0.35 + 0.45 * rand()) * (1.15 - 0.5 * edge), // taller than meadow, shorter at the edge
          WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * rand(), // width
          rand() * Math.PI * 2, // yaw
          rand(), // random 0..1
        ],
        n * 4,
      );
      shade[n] = groundShade(x, z);
      n++;
    }
  }
  return { offsets, params, shade, count: n };
}

// ---- Shaders ----------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;   // blade root, world position
  attribute vec4 aParams;   // x height, y width, z yaw, w random
  attribute float aShade;   // baked ground brightness

  uniform float uTime;
  uniform float uWind;
  uniform float uRadius;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform vec3 uTrail[10];  // recent cursor points: x = world x, y = world z, z = strength

  varying float vT;
  varying float vShade;
  varying float vRand;
  varying float vPatch;

  #include <fog_pars_vertex>

  void main() {
    float height = aParams.x;
    float width  = aParams.y;
    float yaw    = aParams.z;
    float rnd    = aParams.w;

    // 1. Distance fade: far away, fewer blades survive and the rest shrink.
    float dist = distance(aOffset, cameraPosition);
    float keep = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    float life = clamp((keep - rnd) * 6.0 + 1.0, 0.0, 1.0) * smoothstep(0.0, 0.1, keep);
    if (life <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the screen: skipped, costs nothing later
      return;
    }

    // 2. Blade shape. position.x is -0.5..0.5 across, position.y is 0 (root) to 1 (tip).
    vec3 p = position;
    float bendW = p.y * p.y; // root stays planted, tip moves most
    float w = width * (1.0 + dist * 0.02); // slightly wider far away so it never goes sub-pixel
    float c = cos(yaw);
    float s = sin(yaw);
    vec3 local = vec3(p.x * w * c, p.y * height * life, -p.x * w * s);

    // Natural curve: every blade leans a little along its own facing direction.
    float lean = sin(yaw * 3.7 + 1.3) * 0.45;
    local.xz += vec2(s, c) * lean * height * life * bendW;

    // 3. Wind: two slow waves travelling across the field.
    float wave = sin(uTime * 1.7 + aOffset.x * 0.35 + aOffset.z * 0.27 + rnd * 2.0);
    float gust = sin(uTime * 0.6 + aOffset.x * 0.07 - aOffset.z * 0.09);
    local.xz += vec2(wave * 0.6 + gust, wave * 0.35) * uWind * bendW * height;

    // 4. Cursor: each recent cursor point pushes nearby blades outward and
    //    presses them down. Points fade over time, so the grass springs back.
    vec2 push = vec2(0.0);
    float press = 0.0;
    for (int i = 0; i < 10; i++) {
      vec2 away = aOffset.xz - uTrail[i].xy;
      float infl = (1.0 - smoothstep(0.0, uRadius, length(away))) * uTrail[i].z;
      push += normalize(away + vec2(0.0001)) * infl;
      press = max(press, infl);
    }
    push /= max(1.0, length(push)); // never push further than one blade length
    local.xz += push * height * bendW * 0.9;
    local.y  -= press * height * bendW * 0.45;

    vec4 mvPosition = modelViewMatrix * vec4(aOffset + local, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vT = p.y;
    vShade = aShade;
    vRand = rnd;
    // Large soft patches of lighter / deeper grass across the meadow (0..1).
    vPatch = 0.5 + 0.5 * sin(aOffset.x * 0.13 + aOffset.z * 0.09) * cos(aOffset.z * 0.17 - aOffset.x * 0.05);

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;

  varying float vT;
  varying float vShade;
  varying float vRand;
  varying float vPatch;

  #include <fog_pars_fragment>

  void main() {
    vec3 col = mix(uBase, uTip, pow(vT, 0.85));   // dark root to light tip
    col *= mix(0.78, 1.12, vPatch);               // meadow-scale light / deep patches
    col *= (0.85 + 0.3 * vRand) * vShade;         // per-blade variation x ground lighting
    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---- Component --------------------------------------------------------

const TRAIL_LENGTH = 10;

export default function Grass() {
  // Built once: 80k blades of data + the shader material.
  const { geometry, material } = useMemo(() => {
    const blades = buildBlades();

    // One blade: 5 vertices (x across, y up), 3 triangles, narrowing to a tip.
    const blade = new THREE.BufferGeometry();
    blade.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -0.5, 0, 0, 0.5, 0, 0, -0.4, 0.45, 0, 0.4, 0.45, 0, 0, 1, 0,
        ]),
        3,
      ),
    );
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);

    // Instanced geometry = that one blade + per-copy data buffers.
    const g = new THREE.InstancedBufferGeometry();
    g.index = blade.index;
    g.setAttribute("position", blade.getAttribute("position"));
    g.setAttribute(
      "aOffset",
      new THREE.InstancedBufferAttribute(blades.offsets, 3),
    );
    g.setAttribute(
      "aParams",
      new THREE.InstancedBufferAttribute(blades.params, 4),
    );
    g.setAttribute(
      "aShade",
      new THREE.InstancedBufferAttribute(blades.shade, 1),
    );
    g.instanceCount = blades.count;

    const trail = Array.from(
      { length: TRAIL_LENGTH },
      () => new THREE.Vector3(0, 0, 0),
    );

    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide, // blades are flat: visible from both sides
      fog: true, // let scene fog (Terrain.jsx) fade the far grass too
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uWind: { value: WIND },
          uRadius: { value: PUSH_RADIUS },
          uFadeStart: { value: FADE_START },
          uFadeEnd: { value: FADE_END },
          uBase: { value: new THREE.Color(BASE_COLOR) },
          uTip: { value: new THREE.Color(TIP_COLOR) },
          uTrail: { value: trail },
        },
      ]),
    });

    return { geometry: g, material: m };
  }, []);

  // Free GPU memory if the scene unmounts (e.g. phase changes).
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state, delta) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    // The trail is a small ring of cursor points. Each frame they all fade;
    // the newest one is held at full strength while the cursor is on grass.
    const trail = u.uTrail.value;
    const decay = Math.exp(-delta * 2.0); // fades to ~13% after one second
    for (let i = 0; i < trail.length; i++) trail[i].z *= decay;

    if (ground.active && !ground.onWater) {
      // `head` = index of the newest point. Start a new point when the cursor
      // has moved more than 0.7 units from it; otherwise just refresh it.
      let head = material.userData.head ?? 0;
      const cur = trail[head];
      const moved = Math.hypot(ground.point.x - cur.x, ground.point.z - cur.y);
      if (cur.z < 0.05 || moved > 0.7) {
        head = (head + 1) % trail.length;
        material.userData.head = head;
      }
      trail[head].set(ground.point.x, ground.point.z, 1);
    }
  });

  // frustumCulled={false}: the shader moves blades, and one draw call covers
  // the whole field, so there is nothing for three.js to cull per object.
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
