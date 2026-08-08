"use client";

import { WorkspacePreview } from "./WorkspacePreview";
import { MetricsStrip } from "./MetricsStrip";
import { FeatureCards } from "./FeatureCards";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#060912",
        color: "#fff",
        paddingTop: 72,
        overflow: "hidden",
      }}
    >
      {/* ── Background ambient glows ── */}

      {/* Large blue glow top-right behind workspace */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -80,
          width: 800,
          height: 700,
          background:
            "radial-gradient(ellipse at 60% 30%, rgba(37,99,235,0.28) 0%, rgba(59,130,246,0.10) 45%, transparent 70%)",
          filter: "blur(8px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Purple ambient center-right */}
      <div
        style={{
          position: "absolute",
          top: 40,
          right: "5%",
          width: 700,
          height: 600,
          background:
            "radial-gradient(ellipse at 75% 25%, rgba(139,92,246,0.22) 0%, transparent 65%)",
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Faint left glow */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 0,
          width: 500,
          height: 500,
          background:
            "radial-gradient(ellipse at 20% 40%, rgba(37,99,235,0.09) 0%, transparent 70%)",
          filter: "blur(30px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Strong blue glow UNDER workspace */}
      <div
        style={{
          position: "absolute",
          top: 320,
          right: -60,
          width: 900,
          height: 400,
          background:
            "radial-gradient(ellipse at 60% 80%, rgba(37,99,235,0.32) 0%, rgba(59,130,246,0.12) 45%, transparent 70%)",
          filter: "blur(24px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Subtle dot-grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Main content wrapper ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1400,
          margin: "0 auto",
          padding: "0 48px 0 48px",
        }}
      >
        {/* ── 2-column hero grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44fr 56fr",
            gap: 16,
            alignItems: "flex-start",
            paddingTop: 36,
            paddingBottom: 16,
          }}
          className="hero-grid"
        >
          {/* ── Left column ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              paddingRight: 8,
              maxWidth: 520,
            }}
          >
            {/* Badge pill */}
            <div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(203,213,225,0.85)",
                  letterSpacing: "0.01em",
                }}
              >
                <svg width="13" height="13" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Next-Gen Trading OS — Built for Professionals
              </span>
            </div>

            {/* Main headline — reference shows each word on its own line */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* "The Ultimate" in white */}
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(40px, 4.2vw, 62px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  color: "#fff",
                }}
              >
                The Ultimate
              </h1>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(36px, 3.8vw, 56px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  background: "linear-gradient(90deg, #3B82F6 0%, #60A5FA 40%, #818CF8 75%, #A855F7 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Trading Operating System
              </h1>

              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 15,
                  color: "rgba(148,163,184,0.85)",
                  lineHeight: 1.65,
                  fontWeight: 400,
                  maxWidth: 440,
                }}
              >
                Real-time analytics. Advanced charting. Multi-broker support.
                AI-powered insights. All in one lightning-fast platform.
              </p>
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: "#2563EB",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "default",
                  boxShadow: "0 0 24px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.3)",
                  letterSpacing: "-0.01em",
                }}
              >
                Start Trading Now
                <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "default",
                  letterSpacing: "-0.01em",
                }}
              >
                Explore Features
                <svg width="12" height="12" fill="none" stroke="#fff" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
            </div>

            {/* Feature pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                {
                  icon: (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#22C55E",
                        display: "inline-block",
                        boxShadow: "0 0 7px rgba(34,197,94,0.8)",
                      }}
                    />
                  ),
                  label: "Real-time Data",
                },
                {
                  icon: (
                    <svg width="12" height="12" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ),
                  label: "Multi-Broker",
                },
                {
                  icon: (
                    <svg width="12" height="12" fill="none" stroke="#A855F7" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  ),
                  label: "AI Insights",
                },
                {
                  icon: (
                    <svg width="12" height="12" fill="none" stroke="#22C55E" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                  label: "100% Secure",
                },
              ].map(({ icon, label }) => (
                <span
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 13px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "rgba(203,213,225,0.85)",
                  }}
                >
                  {icon}
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right column – workspace preview ── */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              // Allow workspace to overflow right edge to match reference
              marginRight: "-48px",
              marginTop: "-8px",
            }}
          >
            <WorkspacePreview />
          </div>
        </div>

        {/* ── Metrics strip ── */}
        <MetricsStrip />

        {/* ── Feature cards ── */}
        <FeatureCards />
      </div>

      {/* Responsive grid override */}
      <style>{`
        @media (max-width: 1024px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
