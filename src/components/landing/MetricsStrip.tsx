"use client";

export function MetricsStrip() {
  const metrics = [
    {
      value: "< 10ms",
      label: "Ultra Low Latency",
      color: "#3B82F6",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#3B82F6" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      value: "99.99%",
      label: "Uptime Reliability",
      color: "#22C55E",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#22C55E" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      value: "500+",
      label: "Built-in Indicators",
      color: "#A855F7",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#A855F7" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
    },
    {
      value: "50+",
      label: "Advanced Modules",
      color: "#F59E0B",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#F59E0B" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      value: "10M+",
      label: "Ticks per Second",
      color: "#3B82F6",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#3B82F6" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      value: "24/7",
      label: "Global Support",
      color: "#EF4444",
      icon: (
        <svg width="18" height="18" fill="none" stroke="#EF4444" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ width: "100%", marginTop: 24, marginBottom: 48 }}>
      <div
        style={{
          background: "rgba(12,16,28,0.8)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "20px 28px",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 16,
          }}
          className="metrics-grid"
        >
          {metrics.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: `${m.color}18`,
                  border: `1px solid ${m.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {m.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: "-0.04em",
                    lineHeight: 1.1,
                  }}
                >
                  {m.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(100,116,139,0.9)",
                    fontWeight: 500,
                    marginTop: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .metrics-grid {
            grid-template-columns: repeat(1, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
