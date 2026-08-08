"use client";

export function WorkspaceOrderPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "188px",
        flexShrink: 0,
        background: "#0C1020",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        padding: "10px 10px 8px",
        color: "#fff",
        fontSize: 11,
        userSelect: "none",
        overflowY: "auto",
      }}
    >
      {/* Order / Position tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: 6,
          marginBottom: 10,
        }}
      >
        <button
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontWeight: 700,
            fontSize: 11,
            borderBottom: "2px solid #3B82F6",
            paddingBottom: 2,
            cursor: "default",
          }}
        >
          Order
        </button>
        <button
          style={{
            background: "none",
            border: "none",
            color: "rgba(148,163,184,0.6)",
            fontWeight: 600,
            fontSize: 11,
            cursor: "default",
          }}
        >
          Position
        </button>
      </div>

      {/* Symbol + price */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>RELIANCE</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#34D399" }}>₹2,987.50</span>
        </div>
        <div
          style={{ textAlign: "right", fontSize: 10, color: "#34D399", marginTop: 1 }}
        >
          +1.25 (+0.67%)
        </div>
      </div>

      {/* Buy / Sell toggle */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          padding: 3,
          marginBottom: 10,
        }}
      >
        <button
          style={{
            padding: "5px 0",
            borderRadius: 7,
            background: "#22C55E",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            border: "none",
            cursor: "default",
            boxShadow: "0 2px 8px rgba(34,197,94,0.35)",
          }}
        >
          Buy
        </button>
        <button
          style={{
            padding: "5px 0",
            borderRadius: 7,
            background: "transparent",
            color: "rgba(148,163,184,0.6)",
            fontWeight: 600,
            fontSize: 12,
            border: "none",
            cursor: "default",
          }}
        >
          Sell
        </button>
      </div>

      {/* Order Type */}
      <div style={{ marginBottom: 7 }}>
        <div style={{ color: "rgba(100,116,139,0.9)", fontSize: 10, marginBottom: 3, fontWeight: 500 }}>
          Order Type
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            padding: "5px 8px",
            color: "#fff",
            fontWeight: 500,
          }}
        >
          <span>Limit</span>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 7 }}>
        <div style={{ color: "rgba(100,116,139,0.9)", fontSize: 10, marginBottom: 3, fontWeight: 500 }}>
          Price
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            padding: "5px 8px",
            color: "#fff",
            fontWeight: 600,
            fontFamily: "monospace",
          }}
        >
          186.40
        </div>
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: 7 }}>
        <div style={{ color: "rgba(100,116,139,0.9)", fontSize: 10, marginBottom: 3, fontWeight: 500 }}>
          Quantity
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            padding: "5px 8px",
            color: "#fff",
            fontWeight: 600,
            fontFamily: "monospace",
          }}
        >
          100
        </div>
      </div>

      {/* Time in Force */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "rgba(100,116,139,0.9)", fontSize: 10, marginBottom: 3, fontWeight: 500 }}>
          Time in Force
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            padding: "5px 8px",
            color: "#fff",
            fontWeight: 500,
          }}
        >
          <span>Day</span>
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Place Buy Order button */}
      <button
        style={{
          width: "100%",
          padding: "8px 0",
          background: "#22C55E",
          border: "none",
          borderRadius: 9,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "default",
          boxShadow: "0 0 16px rgba(34,197,94,0.35)",
          marginBottom: 10,
        }}
      >
        Place Buy Order
      </button>

      {/* Buying Power */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
        }}
      >
        <span style={{ color: "rgba(100,116,139,0.8)" }}>Buying Power</span>
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontFamily: "monospace",
            fontSize: 11,
          }}
        >
          ₹24,531.21
        </span>
      </div>
    </div>
  );
}
