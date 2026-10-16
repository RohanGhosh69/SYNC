// BlurOverlay: a soft blur around the edges of the screen, with a clear centre.
// It is a plain DOM layer above the canvas (and below the page UI), so the
// 3D scene's own rendering is not touched at all.

// The tuning knobs, in one place.
const BLUR_PX = 4; // blur radius at the very edges, in pixels
const CLEAR_UNTIL = 28; // % of the way out from the centre that stays perfectly sharp

// Transparent in the middle (no blur), solid at the edges (full blur),
// with a smooth fade in between.
const MASK = `radial-gradient(ellipse at 50% 50%, transparent ${CLEAR_UNTIL}%, #000 85%)`;

export default function BlurOverlay() {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        // Stretch 24px past every screen edge so the blur never samples
        // "nothing" at the borders (that would show as a faint rim).
        inset: "-24px",
        backdropFilter: `blur(${BLUR_PX}px)`,
        WebkitBackdropFilter: `blur(${BLUR_PX}px)`, // Safari needs the prefix
        maskImage: MASK,
        WebkitMaskImage: MASK,
      }}
    />
  );
}