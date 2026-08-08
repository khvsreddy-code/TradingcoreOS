"use client";

export function WorkspaceChart() {
  // Normalized candle data – bullish NIFTY 50 session, scaled to fit SVG viewBox (height 200)
  // Coordinates: y=0 is top, y=200 is bottom. Higher y = lower price.
  const candles = [
    { o: 168, h: 155, l: 172, c: 160, g: false, v: 32 }, // red
    { o: 160, h: 148, l: 165, c: 150, g: false, v: 38 },
    { o: 150, h: 140, l: 155, c: 142, g: false, v: 30 },
    { o: 142, h: 134, l: 148, c: 136, g: false, v: 44 },
    { o: 136, h: 126, l: 140, c: 128, g: false, v: 52 },
    { o: 128, h: 122, l: 133, c: 124, g: false, v: 40 },
    { o: 124, h: 110, l: 128, c: 112, g: false, v: 58 },
    { o: 112, h: 102, l: 118, c: 104, g: false, v: 65 },
    { o: 104, h: 95,  l: 110, c: 97,  g: false, v: 48 },
    { o: 97,  h: 88,  l: 102, c: 90,  g: false, v: 72 },
    { o: 90,  h: 80,  l: 95,  c: 82,  g: false, v: 68 },
    { o: 82,  h: 76,  l: 87,  c: 78,  g: false, v: 80 },
    { o: 78,  h: 68,  l: 82,  c: 70,  g: false, v: 75 },
    { o: 70,  h: 62,  l: 74,  c: 65,  g: true,  v: 88 },
    { o: 65,  h: 55,  l: 70,  c: 57,  g: true,  v: 95 },
    { o: 57,  h: 50,  l: 62,  c: 52,  g: true,  v: 90 },
  ];

  // SVG dimensions
  const W = 500;
  const H = 180;
  const candleW = 14;
  const gap = Math.floor((W - 16) / candles.length);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#080B11",
        color: "white",
        userSelect: "none",
        fontSize: 11,
      }}
    >
      {/* Sub-header: Symbol info + timeframe tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px 5px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#0C101A",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Symbol icon placeholder */}
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "rgba(37,99,235,0.25)",
              border: "1px solid rgba(59,130,246,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 800, color: "#60A5FA" }}>N</span>
          </div>
          <span style={{ fontWeight: 700, color: "#fff", fontSize: 11 }}>NIFTY 50</span>
          <span style={{ color: "rgba(148,163,184,0.6)", fontSize: 10 }}>NSE</span>
          <span style={{ fontWeight: 700, color: "#34D399", fontSize: 11 }}>₹24,865.35</span>
          <span style={{ color: "#34D399", fontSize: 10 }}>+1.25 (+0.67%)</span>
        </div>
        {/* Timeframe selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {["1m", "5m", "15m", "1h", "1D", "1W", "M"].map((tf, i) => (
            <button
              key={tf}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: i === 4 ? 700 : 500,
                color: i === 4 ? "#fff" : "rgba(148,163,184,0.65)",
                background: i === 4 ? "#2563EB" : "transparent",
                border: "none",
                cursor: "default",
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left toolbar */}
        <div
          style={{
            width: 34,
            borderRight: "1px solid rgba(255,255,255,0.06)",
            background: "#090C14",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 8,
            gap: 10,
            flexShrink: 0,
          }}
        >
          {[
            "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5",
            "M12 4v16m8-8H4",
            "M7 17L17 7M17 7H7M17 7V17",
            "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
            "M4 6h16M4 10h16M4 14h16M4 18h16",
            "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
          ].map((d, i) => (
            <button
              key={i}
              style={{
                background: i === 0 ? "rgba(37,99,235,0.15)" : "none",
                border: "none",
                color: i === 0 ? "#60A5FA" : "rgba(148,163,184,0.55)",
                cursor: "default",
                padding: "4px",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={d} />
              </svg>
            </button>
          ))}
        </div>

        {/* Chart area with grid, candles, MA lines */}
        <div style={{ flex: 1, position: "relative", minWidth: 0, overflow: "hidden" }}>
          {/* Horizontal grid lines */}
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            preserveAspectRatio="none"
          >
            {[20, 40, 60, 80].map((pct) => (
              <line
                key={pct}
                x1="0" y1={`${pct}%`}
                x2="100%" y2={`${pct}%`}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
            ))}
          </svg>

          {/* Main SVG: candlesticks + MA lines */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: "calc(100% - 42px)", display: "block" }}
          >
            {/* MA line (blue) */}
            <polyline
              fill="none"
              stroke="#3B82F6"
              strokeWidth="1.5"
              opacity="0.9"
              points={candles
                .map((c, i) => {
                  const x = 8 + i * gap + candleW / 2;
                  const y = (c.o + c.c) / 2;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
            {/* EMA (purple dashed) */}
            <polyline
              fill="none"
              stroke="#A855F7"
              strokeWidth="1.2"
              strokeDasharray="5 3"
              opacity="0.7"
              points={candles
                .map((c, i) => {
                  const x = 8 + i * gap + candleW / 2;
                  const y = (c.o + c.c) / 2 + 12;
                  return `${x},${y}`;
                })
                .join(" ")}
            />

            {/* Candlestick bodies + wicks */}
            {candles.map((c, i) => {
              const x = 8 + i * gap;
              const cx = x + candleW / 2;
              const color = c.g ? "#22C55E" : "#EF4444";
              const bodyTop = Math.min(c.o, c.c);
              const bodyH = Math.max(2, Math.abs(c.o - c.c));

              return (
                <g key={i}>
                  {/* Wick */}
                  <line x1={cx} y1={c.h} x2={cx} y2={c.l} stroke={color} strokeWidth="1.2" />
                  {/* Body */}
                  <rect
                    x={x}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    rx="0.5"
                  />
                </g>
              );
            })}
          </svg>

          {/* Volume bars */}
          <div
            style={{
              height: 26,
              display: "flex",
              alignItems: "flex-end",
              gap: 2,
              padding: "0 8px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {candles.map((c, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(18, c.v)}%`,
                  borderRadius: "2px 2px 0 0",
                  background: c.g
                    ? "rgba(34,197,94,0.35)"
                    : "rgba(239,68,68,0.35)",
                }}
              />
            ))}
          </div>

          {/* Time axis */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "2px 10px 0",
              color: "rgba(100,116,139,0.8)",
              fontSize: 10,
            }}
          >
            <span>May</span>
            <span>10</span>
            <span>Jun</span>
            <span>14</span>
            <span>Jul</span>
            <span>17</span>
          </div>
        </div>

        {/* Right price scale */}
        <div
          style={{
            width: 52,
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            background: "#090C14",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "6px 6px 6px 0",
            textAlign: "right",
            color: "rgba(100,116,139,0.8)",
            fontSize: 10,
            flexShrink: 0,
            fontFamily: "monospace",
          }}
        >
          <span>24,900</span>
          <span>24,850</span>
          <span>24,800</span>
          <span>24,750</span>
          <span>24,700</span>
        </div>
      </div>
    </div>
  );
}
