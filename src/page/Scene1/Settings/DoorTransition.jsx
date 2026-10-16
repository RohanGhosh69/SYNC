import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { motion } from "../../../state/motion";
import { userExp } from "../../../state/userExp";
import { lenis } from "../../../core/SmoothScroll";

// ---- Tuning knobs ----
const TAPS = 2; // clicks needed at the door
const END_AT = 0.97; // scroll progress that counts as "at the door"
const TAP_WINDOW = 1500; // ms: taps further apart than this start over

export default function DoorTransition() {
  const blackRef = useRef(null);

  useEffect(() => {
    let taps = 0;
    let last = 0;
    let busy = false;

    const fly = () => {
      busy = true;
      lenis?.stop(); // freeze scrolling during the glide
      const black = blackRef.current;

      gsap
        .timeline({ onComplete: () => (busy = false) })
        // camera glides through the door
        .to(motion, { fly: 1, duration: 2.6, ease: "power2.inOut" }, 0)
        // screen goes black while crossing the door
        .to(black, { opacity: 1, duration: 1.0, ease: "power1.in" }, 1.2)
        // at full black: switch page, reset camera + scroll
        .add(() => {
          lenis?.start();
          userExp.getState().go("hero");
          motion.fly = 0;
        })
        // reveal the next page from black
        .to(black, { opacity: 0, duration: 1.2, ease: "power1.out" }, "+=0.4");
    };

    const onClick = () => {
      if (busy || userExp.getState().phase !== "intro") return;
      if (motion.progress < END_AT) {
        taps = 0; // not at the door yet
        return;
      }
      const now = performance.now();
      taps = now - last > TAP_WINDOW ? 1 : taps + 1; // slow taps start over
      last = now;
      if (taps >= TAPS) {
        taps = 0;
        fly();
      }
    };

    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // Portal to <body> so the black sits above ALL page UI (the canvas wrapper is z-0).
  return createPortal(
    <div
      ref={blackRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        opacity: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />,
    document.body
  );
}