"use client";

import React from "react";

export function HeroWindow() {
  // ── Candle data: AAPL uptrend matching reference (mostly green, angled up-right) ──
  // SVG viewBox 0 0 460 200 (y=0 top, y=200 bottom)
  // Price range shown: roughly 175–191
  const pMin = 173;
  const pMax = 192;
  const svgH = 200;
  const svgW = 460;
  const candleW = 10;
  const candles = [
    // Initial red pullback cluster (left of chart)
    { o: 183, h: 185, l: 179, c: 180, g: false, v: 38 },
    { o: 180, h: 182, l: 177, c: 178, g: false, v: 45 },
    { o: 178, h: 180, l: 175, c: 176, g: false, v: 55 },
    { o: 176, h: 178, l: 174, c: 175, g: false, v: 62 },
    { o: 175, h: 177, l: 173, c: 174, g: false, v: 70 },
    // Turn-around (doji / small red)
    { o: 174, h: 176, l: 173, c: 175, g: true,  v: 58 },
    // Uptrend begins (long green candles)
    { o: 175, h: 179, l: 174, c: 178, g: true,  v: 55 },
    { o: 178, h: 182, l: 177, c: 181, g: true,  v: 50 },
    { o: 181, h: 184, l: 180, c: 183, g: true,  v: 45 },
    // Brief pause (small red doji)
    { o: 183, h: 184, l: 181, c: 182, g: false, v: 38 },
    // Continued uptrend
    { o: 182, h: 186, l: 181, c: 185, g: true,  v: 52 },
    { o: 185, h: 188, l: 184, c: 187, g: true,  v: 60 },
    // Near the top — current price area ~186.36
    { o: 187, h: 189, l: 185, c: 186, g: false, v: 42 },
    { o: 186, h: 188, l: 185, c: 187, g: true,  v: 40 },
    { o: 187, h: 189, l: 186, c: 188, g: true,  v: 44 },
    { o: 188, h: 190, l: 186, c: 187, g: false, v: 36 },
    { o: 187, h: 189, l: 186, c: 187, g: true,  v: 38 },
  ];

  const totalCandles = candles.length;
  const colW = (svgW - 12) / totalCandles;

  function py(price: number) {
    return svgH - ((price - pMin) / (pMax - pMin)) * (svgH - 24) - 12;
  }

  const maPoints = candles
    .map((c, i) => `${8 + i * colW + candleW / 2},${py((c.o + c.c) / 2)}`)
    .join(" ");

  const emaPoints = candles
    .map((c, i) => `${8 + i * colW + candleW / 2},${py((c.o + c.c) / 2 - 3)}`)
    .join(" ");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#080B13",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "#fff",
        userSelect: "none",
        fontSize: 11,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* ─── Top chrome bar ─── */}
      <div
        style={{
          height: 40,
          background: "rgba(255,255,255,0.025)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#FF5F56" }} />
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#FFBD2E" }} />
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#27C93F" }} />
          </div>
          {/* TC logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: "#2563EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 8px rgba(37,99,235,0.5)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 11 }}>TC</span>
          </div>
          {/* Tools */}
          {[
            { label: "Indicators", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
            { label: "Alert", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
            { label: "Replay", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
          ].map(({ label, icon }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                color: "rgba(148,163,184,0.75)",
                cursor: "default",
                fontWeight: 500,
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {label}
            </div>
          ))}
        </div>
        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {["M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4",
            "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
          ].map((d, i) => (
            <div
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(148,163,184,0.6)",
              }}
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={d} />
              </svg>
            </div>
          ))}
          <button
            style={{
              background: "#2563EB",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "default",
              boxShadow: "0 0 10px rgba(37,99,235,0.5)",
            }}
          >
            Publish
          </button>
        </div>
      </div>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Chart area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Symbol row */}
          <div
            style={{
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 8px 0 6px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "#0A0D16",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 12, color: "#fff" }}>AAPL</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#22C55E" }}>186.36</span>
              <span style={{ fontSize: 9, color: "rgba(34,197,94,0.8)" }}>+1.25 (+0.67%)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {["1m", "5m", "15m", "1h", "4h", "D", "W"].map((tf) => (
                <span
                  key={tf}
                  style={{
                    padding: "2px 5px",
                    fontSize: 10,
                    fontWeight: tf === "D" ? 700 : 500,
                    color: tf === "D" ? "#fff" : "rgba(100,116,139,0.7)",
                    background: tf === "D" ? "#2563EB" : "transparent",
                    borderRadius: 4,
                  }}
                >
                  {tf}
                </span>
              ))}
            </div>
          </div>

          {/* Chart body */}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* Left toolbar */}
            <div
              style={{
                width: 30,
                borderRight: "1px solid rgba(255,255,255,0.06)",
                background: "#090C15",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: 8,
                gap: 8,
                flexShrink: 0,
              }}
            >
              {[
                { d: "M12 4v16m8-8H4", active: true },
                { d: "M7 17L17 7M17 7H7M17 7V17", active: false },
                { d: "M4 6h16M4 12h16M4 18h16", active: false },
                { d: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z", active: false },
              ].map(({ d, active }, i) => (
                <div
                  key={i}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: active ? "rgba(37,99,235,0.15)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: active ? "#60A5FA" : "rgba(100,116,139,0.55)",
                  }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
                  </svg>
                </div>
              ))}
            </div>

            {/* SVG chart */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {/* Current price dashed line */}
              <div
                style={{
                  position: "absolute",
                  top: "20%",
                  left: 0,
                  right: 0,
                  borderTop: "1px dashed rgba(34,197,94,0.5)",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: -10,
                    background: "#16A34A",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 5px",
                    borderRadius: "3px 0 0 3px",
                  }}
                >
                  186.36
                </div>
              </div>

              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                preserveAspectRatio="none"
                style={{ width: "100%", height: "calc(100% - 40px)", display: "block" }}
              >
                {/* Grid */}
                {[20, 40, 60, 80].map((pct) => (
                  <line key={pct} x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 5" />
                ))}
                {/* Blue MA */}
                <polyline fill="none" stroke="#3B82F6" strokeWidth="1.5" opacity="0.85" points={maPoints} />
                {/* Purple EMA */}
                <polyline fill="none" stroke="#A855F7" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6" points={emaPoints} />

                {/* Candles */}
                {candles.map((c, i) => {
                  const x = 8 + i * colW;
                  const cx = x + candleW / 2;
                  const color = c.g ? "#22C55E" : "#EF4444";
                  const bodyTop = Math.min(py(c.o), py(c.c));
                  const bodyBot = Math.max(py(c.o), py(c.c));
                  const bodyH = Math.max(2, bodyBot - bodyTop);
                  return (
                    <g key={i}>
                      <line x1={cx} y1={py(c.h)} x2={cx} y2={py(c.l)} stroke={color} strokeWidth="1.2" />
                      <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} rx="1" />
                    </g>
                  );
                })}
              </svg>

              {/* Volume */}
              <div
                style={{
                  height: 26,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 1,
                  padding: "0 4px",
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {candles.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${Math.min(90, Math.max(15, c.v))}%`,
                      borderRadius: "2px 2px 0 0",
                      background: c.g ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
                    }}
                  />
                ))}
              </div>

              {/* Time axis */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "2px 8px 0",
                  color: "rgba(100,116,139,0.7)",
                  fontSize: 9,
                  height: 14,
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

            {/* Y-axis */}
            <div
              style={{
                width: 44,
                borderLeft: "1px solid rgba(255,255,255,0.06)",
                background: "#090C15",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "6px 4px",
                color: "rgba(100,116,139,0.7)",
                fontSize: 9,
                textAlign: "right",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              <span>190.00</span>
              <span>188.00</span>
              <span>186.00</span>
              <span>184.00</span>
              <span>182.00</span>
              <span>180.00</span>
              <span>178.00</span>
              <span>175.00</span>
            </div>
          </div>
        </div>

        {/* ── Order Panel ── */}
        <div
          style={{
            width: 185,
            borderLeft: "1px solid rgba(255,255,255,0.07)",
            background: "#090C14",
            display: "flex",
            flexDirection: "column",
            padding: "10px 10px 8px",
            flexShrink: 0,
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 14,
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              marginBottom: 10,
              paddingBottom: 6,
            }}
          >
            <span style={{ color: "#fff", fontWeight: 700, borderBottom: "2px solid #3B82F6", paddingBottom: 4, marginBottom: -7, fontSize: 12 }}>
              Order
            </span>
            <span style={{ color: "rgba(100,116,139,0.7)", fontWeight: 500, fontSize: 12 }}>
              Position
            </span>
          </div>

          {/* Symbol + price */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>AAPL</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#22C55E" }}>186.36</div>
              <div style={{ fontSize: 9, color: "rgba(34,197,94,0.8)" }}>+1.25 (+0.67%)</div>
            </div>
          </div>

          {/* Buy/Sell toggle */}
          <div style={{
            display: "flex",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: 3,
            marginBottom: 10,
            gap: 3,
          }}>
            <button style={{
              flex: 1, background: "#22C55E", color: "#fff", fontWeight: 700,
              fontSize: 11, padding: "5px 0", borderRadius: 6, border: "none",
              cursor: "default", boxShadow: "0 2px 8px rgba(34,197,94,0.3)",
            }}>Buy</button>
            <button style={{
              flex: 1, background: "transparent", color: "rgba(100,116,139,0.7)",
              fontWeight: 600, fontSize: 11, padding: "5px 0", borderRadius: 6,
              border: "none", cursor: "default",
            }}>Sell</button>
          </div>

          {/* Form fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
            {[
              { label: "Order Type", value: "Limit", dropdown: true },
              { label: "Price", value: "186.40", dropdown: false },
              { label: "Quantity", value: "100", dropdown: false },
              { label: "Time in Force", value: "DAY", dropdown: true },
            ].map(({ label, value, dropdown }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "rgba(100,116,139,0.7)", marginBottom: 3, fontWeight: 500 }}>
                  {label}
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 6, padding: "5px 8px",
                  color: "#fff", fontWeight: 500,
                  display: "flex", justifyContent: dropdown ? "space-between" : "flex-end",
                  alignItems: "center",
                  fontFamily: dropdown ? "inherit" : "monospace",
                  fontSize: 11,
                }}>
                  <span>{value}</span>
                  {dropdown && (
                    <svg width="10" height="10" fill="none" stroke="rgba(100,116,139,0.7)" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Place Buy Order */}
          <button style={{
            width: "100%", background: "#22C55E", color: "#fff", fontWeight: 700,
            fontSize: 12, padding: "8px 0", borderRadius: 7, border: "none",
            cursor: "default", marginTop: 10,
            boxShadow: "0 0 14px rgba(34,197,94,0.28)",
          }}>
            Place Buy Order
          </button>

          {/* Buying power */}
          <div style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            marginTop: 8, paddingTop: 7,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 9, color: "rgba(100,116,139,0.7)", fontWeight: 500 }}>Buying Power</span>
            <span style={{ fontSize: 10, color: "#fff", fontWeight: 600, fontFamily: "monospace" }}>$24,531.21</span>
          </div>
        </div>
      </div>
    </div>
  );
}
