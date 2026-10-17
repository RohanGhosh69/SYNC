import { useEffect, useRef, useState } from "react";
import { motion } from "../../../state/motion";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(SplitText, useGSAP);

export default function Background() {
  const [atEnd, setAtEnd] = useState(false);

  // Instructions logic connected to scroll.
  useEffect(() => {
    const checkProgress = () => {
      setAtEnd(motion.progress >= 0.98);
    };

    const interval = setInterval(checkProgress, 100);

    return () => clearInterval(interval);
  }, []);

  // User Message GSAP Animation
  const messageRef = useRef(null);

  useGSAP(() => {
    const split = new SplitText(messageRef.current, {
      type: "chars",
    });

    gsap.from(split.chars, {
      y: 20,
      opacity: 0,
      stagger: 0.015,
      duration: 0.5,
      ease: "back.out(1.7)",
      delay: 0.3,
    });

    return () => split.revert();
  });

  // Hero - heading GSAP animation
  const heroRef = useRef(null);

  useEffect(() => {
  const checkScrollProgress = () => {
    const progress = motion.progress;

    gsap.to(heroRef.current, {
      opacity: progress >= 0.99 ? 0 : 1,
      duration: 0.4,
      ease: "power2.out",
      overwrite: true,
    });
  };

  const interval = setInterval(checkScrollProgress, 100);

  return () => clearInterval(interval);
}, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Top-left: DREAM Logo */}
      <div className="absolute top-8 left-10 sm:top-8 sm:left-10 opacity-90">
        <img
          src="/images/Logo.webp"
          alt="DREAM"
          className="w-20 sm:w-24 h-auto object-contain"
          draggable={false}
        />
      </div>

      {/* Top-center: Page Title */}
      <div className="absolute top-8 left-[52%] -translate-x-1/2 uppercase opacity-95">
        <img
          src="/images/title_1.webp"
          alt="Page 1 Title"
          className="w-12 sm:w-24 h-auto object-contain"
          draggable={false}
        />
      </div>

      {/* Top-right: Flower Refresh Button */}
      <button
        type="button"
        aria-label="Refresh flowers"
        className="pointer-events-auto absolute top-6 right-10 flex h-5 w-5 items-center justify-center"
        onClick={() => window.location.reload()}
      >
        <img
          src="/images/refresh.png"
          alt="Refresh Button"
          className="h-7 w-7 object-contain transition-all duration-300 ease-out hover:scale-120 hover:drop-shadow-[0_0_18px_rgba(240,189,72,1)]"
          draggable={false}
        />
      </button>

      {/* Center: Animated Hero Text */}
      <div
        ref={heroRef}
        className="pointer-events-auto absolute left-1/2 top-[60%] z-20
             -translate-x-1/2 -translate-y-1/2
             cursor-pointer select-none text-center"
        onPointerEnter={() => {
          const chars = heroRef.current?.querySelectorAll(".hero-char");
          if (!chars) return;

          gsap.to(chars, {
            x: () => gsap.utils.random(-100, 100),
            y: () => gsap.utils.random(-80, 80),
            rotation: () => gsap.utils.random(-180, 180),
            opacity: 0,
            scale: 0.2,
            filter: "blur(4px)",
            duration: 0.65,
            stagger: {
              each: 0.008,
              from: "random",
            },
            ease: "power2.out",
            overwrite: true,
          });
        }}
        onPointerLeave={() => {
          const chars = heroRef.current?.querySelectorAll(".hero-char");
          if (!chars) return;

          gsap.to(chars, {
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.7,
            stagger: {
              each: 0.008,
              from: "random",
            },
            ease: "power3.out",
            overwrite: true,
          });
        }}
      >
        <div className="flex items-center justify-center whitespace-nowrap gap-[0.8em]">"
          {["Melody", "," , "Unveils", ",", "Reverie"].map((word) => (
            <div
              key={word}
              className="leading-none"
              style={{
                fontWeight: "bold",
                fontFamily: "DreamHero, Georgia, serif",
                fontSize: "clamp(1.8rem, 4.8vw, 4rem)",
                color: "var(--color-background)",
                letterSpacing: "0.12em",
                textShadow: "0 2px 12px rgba(35, 45, 30, 0.3)",
              }}
            >
              {word.split("").map((char, index) => (
                <span
                  key={`${word}-${index}`}
                  className="hero-char inline-block"
                  style={{
                    willChange: "transform, opacity, filter",
                  }}
                >
                  {char}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-left: User Message */}
      <div
        ref={messageRef}
        className="pointer-events-none absolute bottom-8 left-8 z-10
             max-w-xs rounded-2xl px-4 py-3
            opacity-75"
        style={{
          background: "var(--color-background)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          boxShadow: "0 8px 24px rgba(51, 39, 31, 0.18)",
        }}
      >
        <p
          className="m-0 text-sm leading-relaxed sm:text-base"
          style={{
            fontFamily: "DreamContent, sans-serif",
            fontWeight: 400,
            color: "var(--color-heading)",
            textShadow: "0 1px 5px rgba(35, 45, 30, 0.25)",
            letterSpacing: "0.01em",
          }}
        >
          Dreams carry us far from reality, but what about the dreams of others?
          Let me take you into mine through music. Relax and experience the
          euphoria.
        </p>
      </div>

      {/* Bottom-right: User Instructions */}
      <div
        className="pointer-events-none absolute bottom-10 right-10 z-10 text-right"
        style={{
          fontFamily: "DreamContent, sans-serif",
          color: "var(--color-secondary)",
          textShadow: "0 1px 6px rgba(0, 0, 0, 0.35)",
        }}
      >
        <p className="m-0 text-xs tracking-[0.12em] sm:text-sm">
          {atEnd ? "TAP 3 TIMES" : "SCROLL OR INTERACT"}
        </p>
      </div>
    </div>
  );
}
