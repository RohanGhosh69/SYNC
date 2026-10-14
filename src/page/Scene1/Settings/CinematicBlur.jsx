import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Effect } from "postprocessing";
import { EffectComposer } from "@react-three/postprocessing";
import { motion } from "../../../state/motion";

const fragmentShader = /* glsl */ `
uniform float uProgress;
uniform float uStrength;
uniform vec2 uResolution;

void mainImage(
    const in vec4 inputColor,
    const in vec2 uv,
    out vec4 outputColor
) {
    // Distance from the screen centre, corrected for aspect ratio.
    vec2 centered = uv - vec2(0.5);
    centered.x *= uResolution.x / uResolution.y;

    float distanceFromCenter = length(centered);

   // Keep the central door area clear.
   // Begin the blur closer to the centre and extend it toward the edges.
   float edgeMask = smoothstep(0.12, 0.95, distanceFromCenter);

   // Preserve visible blur even at the beginning.
   // Scrolling gradually intensifies it.
   float scrollAmount = mix(0.45, 1.0, smoothstep(0.0, 0.75, uProgress));

   float blurAmount = edgeMask * uStrength * scrollAmount;

    vec2 texel = 1.0 / uResolution;

    // Increase the sampling radius for more noticeable softness.
    float radius = blurAmount * 3.0;

    // Sample in eight directions for a smoother, radial soft-focus effect.
    vec4 blurred = inputColor;

    blurred += texture2D(inputBuffer, uv + vec2( texel.x, 0.0) * radius);
    blurred += texture2D(inputBuffer, uv + vec2(-texel.x, 0.0) * radius);
    blurred += texture2D(inputBuffer, uv + vec2(0.0,  texel.y) * radius);
    blurred += texture2D(inputBuffer, uv + vec2(0.0, -texel.y) * radius);

    blurred += texture2D(inputBuffer, uv + vec2( texel.x,  texel.y) * radius);
    blurred += texture2D(inputBuffer, uv + vec2(-texel.x,  texel.y) * radius);
    blurred += texture2D(inputBuffer, uv + vec2( texel.x, -texel.y) * radius);
    blurred += texture2D(inputBuffer, uv + vec2(-texel.x, -texel.y) * radius);

    blurred /= 9.0;

    // Blend the blur only where the edge mask allows it.
    outputColor = mix(inputColor, blurred, blurAmount);
}
`;

class CinematicBlurEffect extends Effect {
  constructor() {
    super("CinematicBlurEffect", fragmentShader, {
      uniforms: new Map([
        ["uProgress", { value: 0 }],
        ["uStrength", { value: 0.9 }],
        ["uResolution", { value: { x: 1, y: 1 } }],
      ]),
    });
  }
}

function FocusEffect() {
  const effectRef = useRef(null);
  const { size } = useThree();

  useFrame(() => {
    const effect = effectRef.current;
    if (!effect) return;

    effect.uniforms.get("uProgress").value = Math.max(
      0,
      Math.min(1, motion.progress),
    );

    const resolution = effect.uniforms.get("uResolution").value;
    resolution.x = size.width;
    resolution.y = size.height;
  });

  return <primitive ref={effectRef} object={new CinematicBlurEffect()} />;
}

export default function CinematicBlur() {
  return (
    <EffectComposer 
      multisampling={0}
      enableNormalPass={false}>
      <FocusEffect />
    </EffectComposer>
  );
}
