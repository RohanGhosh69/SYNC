import * as THREE from "three";

// CloudShadow: fake drifting cloud shadows, shared by every ground shader.
//
// Idea: real shadows would need shadow maps (too heavy for 300k grass blades
// on an integrated GPU). Instead we ask one cheap question per spot on the
// ground: "is a cloud shadow over this (x, z) right now?" The answer comes
// from a soft noise pattern that slides slowly across the world. Grass,
// terrain, flowers and water all ask the SAME question, so the shadow lines
// up across all of them.
//
// This file only DEFINES the function. Each shader pastes CLOUD_SHADOW_GLSL
// in and calls cloudShadeMul(worldXZ, time).

// All the tuning knobs live here, in one place.
export const CLOUD_SHADOW = {
  scale: 0.045, // pattern size: smaller number = bigger patches (0.045 = ~22 unit blobs)
  speed: 0.6, // how fast the shadows drift, in world units per second
  dirX: 1.0, // drift direction: +x is left to right, like the clouds
  dirZ: -0.2, // a slight drift away from the camera
  coverage: 0.55, // 0..1: higher = fewer / smaller shadows
  softness: 0.09, // soft edge width: higher = blurrier shadow edges
  strength: 0.8, // how much light a shadow removes (0 = none, 1 = full tint)
  tint: "#7F9CC4", // shadow colour multiplier: cool blue, like sky-lit shade
  sunTint: "#FFEC83", // colour multiplier for SUNLIT ground: a warm cream-gold (white = no change)
};

// GLSL needs numbers written with a decimal point (1.0, not 1), so we
// format them here when building the shader text.
const f = (n) => n.toFixed(4);

// THREE.Color converts the hex to the linear values the shaders work in.
const tint = new THREE.Color(CLOUD_SHADOW.tint);
const sunTint = new THREE.Color(CLOUD_SHADOW.sunTint);

const lo = CLOUD_SHADOW.coverage - CLOUD_SHADOW.softness;
const hi = CLOUD_SHADOW.coverage + CLOUD_SHADOW.softness;

export const CLOUD_SHADOW_GLSL = /* glsl */ `
  // Random number from a 2D cell coordinate.
  float csHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Smooth "value noise": random numbers at the grid corners, blended
  // smoothly in between. Gives soft blobs instead of hard squares.
  float csNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 fr = fract(p);
    fr = fr * fr * (3.0 - 2.0 * fr); // smooth the blend (ease in/out)
    float a = csHash(i);
    float b = csHash(i + vec2(1.0, 0.0));
    float c = csHash(i + vec2(0.0, 1.0));
    float d = csHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
  }

  // Colour MULTIPLIER for a spot on the ground: (1,1,1) in sunlight,
  // darker and cooler inside a cloud shadow. Multiply your lit colour by it.
  vec3 cloudShadeMul(vec2 xz, float time) {
    // Slide the whole pattern along the wind direction over time.
    vec2 drift = vec2(${f(CLOUD_SHADOW.dirX)}, ${f(CLOUD_SHADOW.dirZ)}) * time * ${f(CLOUD_SHADOW.speed)};
    vec2 p = (xz - drift) * ${f(CLOUD_SHADOW.scale)};

    // Two layers of noise: big blobs plus a smaller, fainter layer so the
    // shadow edges are not perfectly smooth.
    float n = csNoise(p);

    // Turn noise into shadow: below "lo" = sun, above "hi" = full shadow,
    // soft transition in between.
    float shadow = smoothstep(${f(lo)}, ${f(hi)}, n);

    return mix(
      vec3(${f(sunTint.r)}, ${f(sunTint.g)}, ${f(sunTint.b)}),
      vec3(${f(tint.r)}, ${f(tint.g)}, ${f(tint.b)}),
      shadow * ${f(CLOUD_SHADOW.strength)}
    );
  }
`;
