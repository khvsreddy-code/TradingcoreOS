"use client";

import { HeroWindow } from "./HeroWindow";

export function WorkspacePreview() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "600px",
        overflow: "visible",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: "1800px",
          perspectiveOrigin: "35% 50%",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: "rotateY(16deg) rotateX(4deg) rotateZ(-2deg)",
          }}
        >
          {/* ── WINDOW 3: Back-most window ── */}
          <div
            style={{
              position: "absolute",
              top: "-8%",
              right: "-12%",
              width: "75%",
              height: "82%",
              transform: "translate3d(60px, -40px, -180px)",
              opacity: 0.4,
              filter: "blur(1.5px)",
              zIndex: 1,
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            <HeroWindow />
          </div>

          {/* ── WINDOW 2: Middle window ── */}
          <div
            style={{
              position: "absolute",
              top: "-2%",
              right: "-4%",
              width: "78%",
              height: "86%",
              transform: "translate3d(30px, -20px, -90px)",
              opacity: 0.75,
              filter: "blur(0.5px)",
              zIndex: 2,
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.07)",
            }}
          >
            <HeroWindow />
          </div>

          {/* ── WINDOW 1: Main front window ── */}
          <div
            style={{
              position: "absolute",
              top: "4%",
              left: "4%",
              width: "82%",
              height: "92%",
              transform: "translate3d(0, 0, 0)",
              opacity: 1,
              zIndex: 3,
              borderRadius: 14,
              overflow: "hidden",
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.4), 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12), 0 40px 80px rgba(37,99,235,0.2)",
            }}
          >
            <HeroWindow />
          </div>
        </div>
      </div>

      {/* ── GLOW: Strong blue bloom below workspace ── */}
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: "20%",
          right: "10%",
          height: 180,
          background:
            "radial-gradient(ellipse at 50% 100%, rgba(37,99,235,0.7) 0%, rgba(59,130,246,0.3) 40%, transparent 70%)",
          filter: "blur(24px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── GLOW: Purple ambient behind top-right ── */}
      <div
        style={{
          position: "absolute",
          top: "0%",
          right: "-15%",
          width: "60%",
          height: "70%",
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(139,92,246,0.25) 0%, transparent 60%)",
          filter: "blur(32px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    </div>
  );
}
