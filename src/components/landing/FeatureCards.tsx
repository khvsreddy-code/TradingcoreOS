"use client";

import React from "react";

export function FeatureCards() {
  return (
    <div
      style={{
        width: "100%",
        height: 520,
        background: "#080B13",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--font-sans), sans-serif",
        color: "#fff",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        marginBottom: 80,
      }}
    >
      {/* ── TOP NAVBAR ── */}
      <div
        style={{
          height: 44,
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 20,
        }}
      >
        {/* TC Logo */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "#2563EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 10px rgba(37,99,235,0.4)",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-1px" }}>TC</span>
        </div>

        {/* Search */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "rgba(148,163,184,0.7)",
            width: 180,
          }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Search (Ctrl+K)
        </div>

        {/* Global Toolbar Tabs (Mock) */}
        <div style={{ display: "flex", gap: 24, flex: 1, alignItems: "center" }}>
          {/* Active Tab */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
            Watchlist
          </div>
          {/* Other Tabs */}
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(148,163,184,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
            AAPL <span style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>Apple Inc. • NASDAQ</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(148,163,184,0.7)" }}>Order Book</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(148,163,184,0.7)" }}>Time & Sales</div>
        </div>

        {/* Right Tools */}
        <div style={{ display: "flex", gap: 12, color: "rgba(148,163,184,0.7)" }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
      </div>

      {/* ── MAIN WORKSPACE AREA ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* LEFT SIDEBAR */}
        <div style={{ width: 140, borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {["Watchlist", "Markets", "Charts", "Options", "Portfolio", "Orders", "Positions", "Alerts", "News", "AI Research"].map((item, i) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: i === 0 ? "rgba(37,99,235,0.15)" : "transparent", color: i === 0 ? "#60A5FA" : "rgba(148,163,184,0.7)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              <div style={{ width: 14, height: 14, border: "1px solid currentColor", borderRadius: 3 }} />
              {item}
            </div>
          ))}
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", color: "rgba(148,163,184,0.7)", fontSize: 12, fontWeight: 500 }}>
             ... More
          </div>
        </div>

        {/* WATCHLIST PANEL */}
        <div style={{ width: 280, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ height: 36, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: "rgba(148,163,184,0.6)", fontWeight: 600 }}>
            <span style={{ flex: 2 }}>Symbol</span>
            <span style={{ flex: 1, textAlign: "right" }}>Last</span>
            <span style={{ flex: 1, textAlign: "right" }}>Chg</span>
            <span style={{ flex: 1, textAlign: "right" }}>Chg%</span>
          </div>
          {/* Data */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {[
              { s: "NIFTY", l: "24,833.70", c: "+146.80", cp: "+0.59%", up: true },
              { s: "BANKNIFTY", l: "51,238.90", c: "+272.35", cp: "+0.53%", up: true },
              { s: "RELIANCE", l: "2,950.40", c: "-12.60", cp: "-0.43%", up: false },
              { s: "TCS", l: "3,782.50", c: "+18.45", cp: "+0.49%", up: true },
              { s: "HDFCBANK", l: "1,678.95", c: "+8.90", cp: "+0.53%", up: true },
              { s: "INFY", l: "1,475.30", c: "-5.30", cp: "-0.36%", up: false },
              { s: "ICICIBANK", l: "1,234.60", c: "+6.15", cp: "+0.50%", up: true },
              { s: "SBIN", l: "812.45", c: "-2.80", cp: "-0.34%", up: false },
              { s: "AAPL", l: "186.36", c: "+1.25", cp: "+0.67%", up: true },
              { s: "MSFT", l: "415.23", c: "+2.63", cp: "+0.64%", up: true },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", fontSize: 11, fontFamily: "monospace", letterSpacing: "-0.5px" }}>
                <span style={{ flex: 2, fontWeight: 700, fontFamily: "var(--font-sans), sans-serif", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: row.up ? "#22C55E" : "#EF4444" }} />
                  {row.s}
                </span>
                <span style={{ flex: 1, textAlign: "right", color: "#fff" }}>{row.l}</span>
                <span style={{ flex: 1, textAlign: "right", color: row.up ? "#22C55E" : "#EF4444" }}>{row.c}</span>
                <span style={{ flex: 1, textAlign: "right", color: row.up ? "#22C55E" : "#EF4444" }}>{row.cp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHART PANEL */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Chart Header */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
             <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
               <span style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>186.36</span>
               <span style={{ fontSize: 14, fontWeight: 600, color: "#22C55E" }}>+1.25 (+0.67%)</span>
             </div>
             <div style={{ display: "flex", gap: 6 }}>
               {["1m", "5m", "15m", "1h", "4h", "D", "W", "M"].map(tf => (
                 <span key={tf} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: tf === "D" ? "rgba(255,255,255,0.1)" : "transparent", color: tf === "D" ? "#fff" : "rgba(148,163,184,0.7)", cursor: "pointer" }}>{tf}</span>
               ))}
             </div>
          </div>
          {/* Chart Area */}
          <div style={{ flex: 1, position: "relative", background: "rgba(255,255,255,0.01)" }}>
             {/* Mock chart candles - simplified using lines and rects via SVG */}
             <svg width="100%" height="100%" preserveAspectRatio="none">
               {/* Grid lines */}
               {[20, 40, 60, 80].map(y => <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="rgba(255,255,255,0.03)" strokeDasharray="4 4" />)}
               {/* Candles */}
               {Array.from({length: 40}).map((_, i) => {
                 const x = 20 + (i * 12);
                 const h = 10 + Math.random() * 40;
                 const y = 50 + Math.sin(i * 0.2) * 30 + (Math.random() * 10 - 5);
                 const isGreen = i > 0 && Math.random() > 0.4;
                 return (
                   <g key={i}>
                     <line x1={x+3} y1={y-h/2 - Math.random()*10} x2={x+3} y2={y+h/2 + Math.random()*10} stroke={isGreen ? "#22C55E" : "#EF4444"} strokeWidth="1" />
                     <rect x={x} y={y-h/2} width={6} height={h} fill={isGreen ? "#22C55E" : "#EF4444"} rx="1" />
                   </g>
                 )
               })}
             </svg>
             {/* Price axis */}
             <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "10px 0", fontSize: 10, color: "rgba(148,163,184,0.6)", textAlign: "right", paddingRight: 8 }}>
               <span>190.00</span>
               <span>188.00</span>
               <span style={{ background: "#22C55E", color: "#fff", padding: "2px 4px", borderRadius: 3 }}>186.36</span>
               <span>184.00</span>
               <span>180.00</span>
               <span>175.00</span>
             </div>
          </div>
        </div>

        {/* ORDER BOOK PANEL */}
        <div style={{ width: 220, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600, color: "#fff" }}>Order Book</div>
          <div style={{ display: "flex", padding: "6px 12px", fontSize: 10, color: "rgba(148,163,184,0.6)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ flex: 1 }}>Price</span>
            <span style={{ flex: 1, textAlign: "right" }}>Size</span>
            <span style={{ flex: 1, textAlign: "right" }}>Bid/Ask</span>
          </div>
          <div style={{ flex: 1, padding: "6px 0", fontFamily: "monospace", fontSize: 11 }}>
            {/* Asks */}
            {[186.40, 186.39, 186.38, 186.37, 186.36].map((p, i) => (
              <div key={p} style={{ display: "flex", padding: "4px 12px", color: "#EF4444", position: "relative" }}>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${20 + i*10}%`, background: "rgba(239,68,68,0.1)" }} />
                <span style={{ flex: 1 }}>{p.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#fff" }}>{(900 + i*300).toLocaleString()}</span>
                <span style={{ flex: 1 }} />
              </div>
            ))}
            {/* Spread */}
            <div style={{ padding: "4px 12px", color: "rgba(148,163,184,0.5)", fontSize: 10, textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.03)", margin: "4px 0" }}>Spread: 0.02</div>
            {/* Bids */}
            {[186.34, 186.33, 186.32, 186.31].map((p, i) => (
              <div key={p} style={{ display: "flex", padding: "4px 12px", color: "#22C55E", position: "relative" }}>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${50 - i*10}%`, background: "rgba(34,197,94,0.1)" }} />
                <span style={{ flex: 1 }}>{p.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#fff" }}>{(2100 - i*200).toLocaleString()}</span>
                <span style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        </div>

        {/* TIME & SALES PANEL */}
        <div style={{ width: 220, borderLeft: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600, color: "#fff" }}>Time & Sales</div>
          <div style={{ display: "flex", padding: "6px 12px", fontSize: 10, color: "rgba(148,163,184,0.6)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ flex: 1 }}>Price</span>
            <span style={{ flex: 1, textAlign: "right" }}>Size</span>
            <span style={{ flex: 1, textAlign: "right" }}>Time</span>
          </div>
          <div style={{ flex: 1, padding: "6px 0", fontFamily: "monospace", fontSize: 11 }}>
            {[
              { p: 186.36, s: 100, t: "10:15:30", type: "up" },
              { p: 186.36, s: 200, t: "10:15:29", type: "up" },
              { p: 186.35, s: 150, t: "10:15:29", type: "down" },
              { p: 186.36, s: 100, t: "10:15:28", type: "up" },
              { p: 186.35, s: 300, t: "10:15:28", type: "down" },
              { p: 186.34, s: 100, t: "10:15:28", type: "down" },
              { p: 186.35, s: 200, t: "10:15:27", type: "up" },
              { p: 186.34, s: 100, t: "10:15:27", type: "down" },
              { p: 186.35, s: 150, t: "10:15:26", type: "up" },
              { p: 186.34, s: 200, t: "10:15:25", type: "down" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", padding: "4px 12px", color: row.type === "up" ? "#22C55E" : "#EF4444" }}>
                <span style={{ flex: 1 }}>{row.p.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "#fff" }}>{row.s}</span>
                <span style={{ flex: 1, textAlign: "right", color: "rgba(148,163,184,0.6)" }}>{row.t}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div style={{ height: 28, borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#22C55E" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
            Connected
          </span>
          <span>Market: <span style={{ color: "#22C55E" }}>Open</span></span>
          <span>Latency: <span style={{ color: "#22C55E" }}>6ms</span></span>
          <span>Data: <span style={{ color: "#22C55E" }}>Live</span></span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span>TradingCore v1.0.0</span>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
      </div>
    </div>
  );
}
