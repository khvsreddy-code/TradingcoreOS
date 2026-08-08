"use client";

export function WorkspaceWatchlist() {
  const items = [
    { symbol: "NIFTY 50",  last: "24,833.70", chg: "+146.80", pct: "+0.59%", pos: true },
    { symbol: "BANKNIFTY", last: "51,238.90", chg: "+272.35", pct: "+0.53%", pos: true },
    { symbol: "RELIANCE",  last: "2,950.40",  chg: "-12.60",  pct: "-0.43%", pos: false },
    { symbol: "TCS",       last: "3,782.50",  chg: "+18.45",  pct: "+0.49%", pos: true },
    { symbol: "HDFCBANK",  last: "1,678.95",  chg: "+8.90",   pct: "+0.53%", pos: true },
    { symbol: "INFY",      last: "1,475.30",  chg: "-5.30",   pct: "-0.36%", pos: false },
    { symbol: "ICICIBANK", last: "1,234.60",  chg: "+6.15",   pct: "+0.50%", pos: true },
    { symbol: "SBIN",      last: "812.45",    chg: "-2.80",   pct: "-0.34%", pos: false },
    { symbol: "AAPL",      last: "186.36",    chg: "+1.25",   pct: "+0.67%", pos: true },
    { symbol: "MSFT",      last: "415.23",    chg: "+2.63",   pct: "+0.64%", pos: true },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#080B13",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        fontSize: 11,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 4,
          padding: "6px 8px 4px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          color: "rgba(100,116,139,0.7)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.02em",
          flexShrink: 0,
        }}
      >
        <span>Symbol</span>
        <span style={{ textAlign: "right" }}>Last</span>
        <span style={{ textAlign: "right", minWidth: 44 }}>Chg%</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "hidden" }}>
        {items.map((item, idx) => (
          <div
            key={item.symbol}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 4,
              padding: "5px 8px",
              alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
            }}
          >
            {/* Symbol */}
            <span
              style={{
                fontWeight: 600,
                color: "rgba(203,213,225,0.9)",
                fontSize: 10,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              ▸ {item.symbol}
            </span>
            {/* Last price */}
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(203,213,225,0.75)",
                textAlign: "right",
              }}
            >
              {item.last}
            </span>
            {/* % change */}
            <span
              style={{
                fontWeight: 700,
                fontSize: 10,
                color: item.pos ? "#22C55E" : "#EF4444",
                textAlign: "right",
                minWidth: 48,
                fontFamily: "monospace",
              }}
            >
              {item.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
