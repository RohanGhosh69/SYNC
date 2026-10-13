import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ground } from "./PointerGround";
import { terrainHeight, LAKE, WATER_LEVEL, DOOR_POS } from "./TerrainHeight";

// ─────────────────────────────────────────────────────────────
// Water v2: a bright, sky-blue lake that matches the reference.
// One plane + one fragment shader (no second scene render). What changed:
//   - bluer sky reflection (the reference lake mirrors a blue sky)
//   - dark green reflection of the far hills along the far bank
//   - ripples stretched sideways, so you get thin horizontal streaks
//   - the door reflection is a broken, wobbling pink/orange streak
//   - a thin dark wet edge instead of a pale rim
//   - toneMapped: false, so the colours below land on screen as written
// ─────────────────────────────────────────────────────────────

// Colours measured from new_design_1.png (sRGB hex).
const DEEP_COLOR = "#25688f"; // body colour in the lake centre
const SHALLOW_COLOR = "#5f9fae"; // teal-ish body colour near the shore
const SKY_HORIZON = "#a9cce0"; // reflected sky near the horizon
const SKY_ZENITH = "#5b93c0"; // reflected sky high up
const HILL_COLOR = "#2f4e3a"; // reflected far hills (dark green)
const DOOR_COLOR = "#e892ad"; // reflected door, pink
const DOOR_GLOW = "#ffc58a"; // reflected light from the open door slit

// Keep these dimensions aligned with the pink door model.
const DOOR = { halfWidth: 1.85, height: 6 };

const MARGIN = 1.25;
const CELL = 0.25;
const RIPPLES = 8;
const RIPPLE_LIFE = 4;

// ── Shaders ───────────────────────────────────────────────────
const vertexShader = /* glsl */ `
  attribute float aDepth;

  varying vec3 vWorld;
  varying float vDepth;

  #include <fog_pars_vertex>

  void main() {
    vWorld = position;
    vDepth = aDepth;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRipples[${RIPPLES}];
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform vec3 uHill;
  uniform vec3 uDoorColor;
  uniform vec3 uDoorGlow;
  uniform vec3 uDoorPos;
  uniform float uDoorHalfW;
  uniform float uDoorHeight;

  varying vec3 vWorld;
  varying float vDepth;

  #include <fog_pars_fragment>

  // Cheap value noise, used for streaks and variation.
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 P = vWorld;
    vec3 V = normalize(cameraPosition - P);

    // 1. Wave normals ---------------------------------------------------
    // Two broad swells keep the lake calm.
    vec3 N = vec3(0.0, 1.0, 0.0);
    float broadA = sin(P.x * 0.55 + P.z * 0.24 + uTime * 0.27);
    float broadB = sin(P.z * 0.62 - P.x * 0.29 - uTime * 0.22);
    N.x += broadA * 0.022;
    N.z += broadB * 0.022;

    // Stretched noise: low frequency along x, high along z. Seen from a low
    // camera angle this becomes thin horizontal streaks, like the reference.
    float streakA = noise21(vec2(P.x * 0.9 + uTime * 0.03, P.z * 3.5 - uTime * 0.12));
    float streakB = noise21(vec2(P.x * 1.7 - uTime * 0.05, P.z * 6.5 + uTime * 0.20));
    N.z += (streakA - 0.5) * 0.045 + (streakB - 0.5) * 0.02;
    N.x += (streakA - 0.5) * 0.01;

    // Cursor ripples (unchanged logic): rings that fade as they travel.
    for (int i = 0; i < ${RIPPLES}; i++) {
      vec4 r = uRipples[i];
      if (r.w > 0.0) {
        vec2 dv = P.xz - r.xy;
        float distanceToRing = length(dv) - r.z * 2.8;
        float envelope = exp(-distanceToRing * distanceToRing * 1.7);
        float slope = cos(distanceToRing * 7.5) * envelope * exp(-r.z * 0.8) * r.w;
        N.xz += normalize(dv + vec2(0.0001)) * slope * 0.34;
      }
    }
    N = normalize(N);

    // 2. Reflection -----------------------------------------------------
    vec3 R = reflect(-V, N);
    R.y = max(R.y, 0.001);

    // Blue sky, lighter at the horizon.
    float horizonBlend = smoothstep(0.015, 0.68, R.y);
    vec3 refl = mix(uSkyHorizon, uSkyZenith, horizonBlend);

    // Far hills: a dark green band at the bottom of the reflected view.
    // The noise makes its upper edge ragged, so it is not a straight line.
    float ryJitter = R.y + (streakB - 0.5) * 0.05;
    float hillBand = (1.0 - smoothstep(0.04, 0.30, ryJitter)) * 0.88;
    refl = mix(refl, uHill, hillBand);

    // Soft brightness variation: bright crests and darker troughs.
    refl *= 0.94 + streakA * 0.12;

    // Door reflection: a vertical streak, broken into slices by the ripples.
    if (R.z < -0.001) {
      float t = (uDoorPos.z - P.z) / R.z;
      if (t > 0.0) {
        vec3 H = P + R * t;
        float sway = sin(P.x * 1.8 + P.z * 0.75 + uTime * 0.35) * 0.10;
        float slice = (streakB - 0.5) * 0.32;
        float rel = H.x - uDoorPos.x + sway + slice;
        float inX = 1.0 - smoothstep(uDoorHalfW - 0.30, uDoorHalfW + 0.30, abs(rel));
        float inY = smoothstep(-0.05, 0.16, H.y)
                  * (1.0 - smoothstep(uDoorHeight - 0.55, uDoorHeight * 1.6, H.y));
        float door = inX * inY;
        float slit = smoothstep(0.40, 0.50, rel) * (1.0 - smoothstep(0.78, 0.90, rel));
        vec3 doorCol = mix(uDoorColor, uDoorGlow, slit);
        // Streaks of the sky showing through keep it from looking pasted on.
        refl = mix(refl, doorCol, door * (0.68 + (streakA - 0.5) * 0.30));
      }
    }

    // 3. Water body -----------------------------------------------------
    float depth = max(vDepth, 0.0);
    vec3 body = mix(uShallow, uDeep, smoothstep(0.05, 0.7, depth));

    // Fresnel: more reflection than before (the reference is mostly mirror).
    float facing = max(dot(N, V), 0.0);
    float fresnel = 0.22 + 0.70 * pow(1.0 - facing, 2.6);
    vec3 col = mix(body, refl, fresnel);

    // Thin bright glints on a few ripple crests.
    float crest = smoothstep(0.62, 0.95, streakB);
    col += uSkyHorizon * crest * 0.10;

    // Faint sun glimmer.
    vec3 sunDirection = normalize(vec3(-0.34, 0.82, 0.43));
    float sunSpecular = pow(max(dot(reflect(-sunDirection, N), V), 0.0), 56.0);
    col += vec3(0.90, 0.95, 1.0) * sunSpecular * 0.20;

    // Thin dark wet edge, strongest where the far bank reflects.
    float wetEdge = 1.0 - smoothstep(0.0, 0.14, depth);
    float farBank = 1.0 - smoothstep(0.10, 0.50, R.y);
    col = mix(col, uHill, wetEdge * (0.25 + 0.30 * farBank));

    // Barely-there foam, broken up by noise.
    float shoreline = 1.0 - smoothstep(0.025, 0.25, depth);
    float foamBreakup = smoothstep(0.55, 0.78, noise21(P.xz * 5.2));
    col = mix(col, vec3(0.80, 0.88, 0.90), shoreline * foamBreakup * 0.03);

    // Feather the water edge. Slightly negative start lets the water creep a
    // touch over the terrain rim instead of stopping short of it.
    float alpha = smoothstep(-0.02, 0.07, vDepth);
    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ── Component ─────────────────────────────────────────────────
export default function Water() {
  const { geometry, material } = useMemo(() => {
    // One plane in world space; surrounding terrain naturally trims its edge.
    const width = LAKE.rx * 2 * MARGIN;
    const length = LAKE.rz * 2 * MARGIN;
    const g = new THREE.PlaneGeometry(
      width,
      length,
      Math.round(width / CELL),
      Math.round(length / CELL),
    );
    g.rotateX(-Math.PI / 2);
    g.translate(LAKE.x, WATER_LEVEL, LAKE.z);

    // Water depth per vertex: drives body colour and the edge fade.
    const pos = g.attributes.position;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      depth[i] = WATER_LEVEL - terrainHeight(pos.getX(i), pos.getZ(i));
    }
    g.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));

    const ripples = Array.from(
      { length: RIPPLES },
      () => new THREE.Vector4(0, 0, 0, 0),
    );

    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
      // The sky behind us is plain CSS (never tone-mapped), and the water
      // mirrors that sky, so skipping the renderer's tone mapping keeps the
      // water the colour we typed. If it ever looks too harsh, set to true.
      toneMapped: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uRipples: { value: ripples },
          uDeep: { value: new THREE.Color(DEEP_COLOR) },
          uShallow: { value: new THREE.Color(SHALLOW_COLOR) },
          uSkyHorizon: { value: new THREE.Color(SKY_HORIZON) },
          uSkyZenith: { value: new THREE.Color(SKY_ZENITH) },
          uHill: { value: new THREE.Color(HILL_COLOR) },
          uDoorColor: { value: new THREE.Color(DOOR_COLOR) },
          uDoorGlow: { value: new THREE.Color(DOOR_GLOW) },
          uDoorPos: { value: new THREE.Vector3(DOOR_POS.x, 0, DOOR_POS.z) },
          uDoorHalfW: { value: DOOR.halfWidth },
          uDoorHeight: { value: DOOR.height },
        },
      ]),
    });

    return { geometry: g, material: m };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Track cursor movement so ripples spawn only after real movement.
  const last = useRef({ x: 0, z: 0, time: -1, next: 0 });

  useFrame((state, delta) => {
    const u = material.uniforms;
    const now = state.clock.elapsedTime;
    u.uTime.value = now;

    const ripples = u.uRipples.value;
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      if (r.w > 0) {
        r.z += delta;
        if (r.z > RIPPLE_LIFE) r.w = 0;
      }
    }

    if (ground.active && ground.onWater) {
      const l = last.current;
      const moved = Math.hypot(ground.point.x - l.x, ground.point.z - l.z);
      if (moved > 0.9 && now - l.time > 0.12) {
        const strength = THREE.MathUtils.clamp(
          0.45 + ground.speed * 0.25,
          0.45,
          1,
        );
        ripples[l.next].set(ground.point.x, ground.point.z, 0, strength);
        l.next = (l.next + 1) % ripples.length;
        l.x = ground.point.x;
        l.z = ground.point.z;
        l.time = now;
      }
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
