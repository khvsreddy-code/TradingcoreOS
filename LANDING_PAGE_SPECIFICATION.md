# TradingCore Visual Design & Architecture Specification (v3.0 - Linear / Raycast / Bloomberg Grade)

**Document Status:** ❄️ FROZEN DESIGN SPECIFICATION  
**Design Aesthetic:** Dark Institutional / Precision Software OS (Linear + Raycast + Bloomberg + Vercel Benchmark)  
**Target Platform:** Web Application Only (`https://app.tradingcore.com`)  
**Product Category:** Browser-Based Trading Operating System (Trading OS)  
**Primary Launch Market:** India (NSE / BSE / NFO | ₹ INR)  

---

## 1. Visual Identity & Aesthetic Philosophy

### "Bloomberg Meets Linear Meets TradingView"
TradingCore's visual design communicates instantaneous execution capability, high mathematical density, and structural stability. It intentionally avoids marketing gimmicks, floating 3D objects, cartoon illustrations, glowing orb background clutter, and crypto-esque rainbow gradients.

```
Visual Tone Matrix:
[ Generic SaaS / Crypto Slop ]  ─────────────────►  [ TradingCore OS ]
• Purple/Cyan Gradients                              • Deep Slate Canvas (#090a0f)
• Floating 3D Gold Coins                             • 1px Hairline Slate Borders (#222636)
• Oversized Fluffy Cards                             • JetBrains Mono Data Grids
• Auto-playing Background Videos                     • High-Density TradingView Layouts
```

### Color Token System
- **Primary Canvas (`--bg-canvas`):** `#090a0f` (Deepest neutral slate black, 2% saturation).
- **Surface Level 1 (`--bg-surface`):** `#11141d` (Card backgrounds, dock containers, header bar).
- **Surface Level 2 (`--bg-surface-elevated`):** `#181c2b` (Hover states, active tab highlights).
- **Hairline Border (`--border-subtle`):** `#222636` (1px precise slate structural borders).
- **Hairline Active (`--border-active`):** `#333a52` (1px hover/active state highlight).
- **Primary Text (`--text-primary`):** `#f3f4f6` (High contrast off-white, 14:1 WCAG ratio).
- **Secondary Text (`--text-secondary`):** `#8c93a6` (Neutral slate gray for labels and supporting text).
- **Execution Emerald (`--accent-bull`):** `#10b981` (Crisp bullish green for buy triggers & status).
- **Execution Crimson (`--accent-bear`):** `#ef4444` (Crisp bearish red for sell triggers & risk warnings).
- **Monospace Accent (`--accent-blue`):** `#3b82f6` (Precision blue for hotkey badges & system telemetry).

### Typography Pairings
- **Headings & Body:** Plus Jakarta Sans / Inter (`letter-spacing: -0.02em` on titles).
- **Data, Hotkeys, Prices & Telemetry:** JetBrains Mono (`font-variant-numeric: tabular-nums`).

---

## 2. Master Section Architecture & Layout Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│ NAVIGATION BAR: Sticky Frosted Glass · Monogram · India First Badge   │
├────────────────────────────────────────────────────────────────────────┤
│ HERO: Split Layout (Left: Typography & CTAs | Right: Realistic OS Frame)│
├────────────────────────────────────────────────────────────────────────┤
│ WHY TRADINGCORE: Bento Grid (Speed · TV Engine · Cloud Native BYOB)   │
├────────────────────────────────────────────────────────────────────────┤
│ WORKSPACE PREVIEW: Interactive Tabbed Browser OS Mockup               │
├────────────────────────────────────────────────────────────────────────┤
│ SUPPORTED BROKERS: 5 Indian Broker API Cards (Zerodha, Dhan, etc.)     │
├────────────────────────────────────────────────────────────────────────┤
│ FEATURES: Multi-chart Grid, Order Entry, Hotkey Engine, Option Chain   │
├────────────────────────────────────────────────────────────────────────┤
│ HOW IT WORKS: 3-Step Setup Timeline (Google Sign In -> BYOB -> Trade)  │
├────────────────────────────────────────────────────────────────────────┤
│ PRICING: Transparent Base Platform + Modular Upgrade Architecture      │
├────────────────────────────────────────────────────────────────────────┤
│ FUTURE MODULES: Frozen Roadmap Cards (Phases 2–7)                      │
├────────────────────────────────────────────────────────────────────────┤
│ FAQ: High-Trust Accordions (Security, BYOB, Latency, SEBI)             │
├────────────────────────────────────────────────────────────────────────┤
│ FOOTER: 4-Column Directory + SEBI Disclaimer + Live API Latency Bar    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Section-by-Section Visual & Technical Specification

### Section 1: Navigation
- **Visual Design:** Pinned sticky top header (`h-16`), `#090a0f`/85 opacity with `backdrop-blur-md` and 1px hairline bottom border (`#222636`).
- **Left Group:** Geometric `TradingCore` monogram logo in emerald fill, accompanied by a live glowing pill badge: `INDIA FIRST · V2.2`.
- **Center Navigation:** Muted text links (`#8c93a6`) with 150ms hover color shift to `#f3f4f6`: `Why TradingCore`, `Brokers`, `Workspace`, `How It Works`, `Pricing`, `Modules`, `FAQ`.
- **Right Action CTAs:** Secondary outline `Sign In` button + Primary emerald `Launch Platform` button with subtle hover elevation.
- **Mobile State:** Collapses center links into a dark slide-down menu overlay on screens `<1024px`.

### Section 2: Hero (First Screen Dominance)
- **Grid Structure:** Asymmetric 2-column desktop grid (`5 lg:7` split).
- **Left Column (Typography & Action):**
  - **Eyebrow Badge:** `BROWSER-BASED TRADING OPERATING SYSTEM` (JetBrains Mono, blue accent border).
  - **Massive Title:** `The Browser OS for Professional Traders.` (`font-size: 56px`, font weight 800, tight tracking `-0.02em`).
  - **Supporting Copy:** `Connect Zerodha, Dhan, Upstox, Angel One, or Fyers. Execute orders via hotkeys, manage trades on live TradingView charts, and analyze options—directly in your browser tab.`
  - **CTA Cluster:** `Connect Broker & Start` (Primary Emerald) + `Explore Live Workspace` (Secondary Outline).
  - **System Metrics Bar:** Monospace telemetry grid (`0ms Download`, `5+ Brokers`, `100% Web Native`, `NSE · BSE · NFO`).
- **Right Column (Realistic Trading OS Browser Mockup):**
  - High-fidelity dark window frame featuring browser window controls (`red/yellow/green` muted dots), active tab title (`TradingCore Workspace v2.2`), live TradingView intraday chart preview, order depth, hotkey status bar (`Ctrl+B Buy | Ctrl+S Sell`), and position P&L tracker.

### Section 3: Why TradingCore
- **Visual Style:** 3-column bento box with `#11141d` surface containers, `#222636` 1px borders, and 32px inner padding.
- **Content Focus:**
  1. **Keyboard-First Execution:** Direct hotkey mappings without mouse interaction.
  2. **Unified TradingView Engine:** Drag-and-drop Stop Loss and Target orders directly on chart lines.
  3. **Zero Desktop Overhead:** No `.exe` files, no local software installs, 100% browser native.

### Section 4: Workspace Preview
- **Visual Style:** Interactive tabbed OS preview container.
- **Tab Controls:** Monospace selector chips (`[01. Multi-Chart Grid]`, `[02. Option Chain & OI]`, `[03. Hotkey Execution]`, `[04. Position Manager]`).
- **Interaction:** Selecting a tab switches the live mock view frame with a crisp 150ms cross-fade animation.

### Section 5: Supported Brokers (Bring Your Own Broker)
- **Visual Style:** 5-card horizontal grid representing Zerodha (Kite), Dhan (DhanHQ), Upstox (Developer API), Angel One (SmartAPI), and Fyers (API v3).
- **Card Elements:** Official broker logo badge, latency metric (`<50ms API Response`), and supported asset classes (`Equity · F&O · Currency`).
- **Security Callout:** Full-width monospace security bar confirming OAuth 2.0 encryption and zero credential storage.

### Section 6: Features
- **Visual Style:** High-density bento grid featuring monospace feature tags (`[HOTKEYS]`, `[TV ENGINE]`, `[OPTION CHAIN]`, `[RISK CONTROLS]`).
- **Details:** Highlights pre-mapped keyboard shortcuts (`Ctrl+B`, `Ctrl+Shift+C`, `Ctrl+Shift+P`, `Ctrl+K`), live option chain analytics with OI ratios, and max-loss risk guardrails.

### Section 7: How It Works
- **Visual Style:** 3-step horizontal timeline connected by a thin slate hairline divider.
- **Steps:**
  1. `01. Sign In with Google` — Instant authentication.
  2. `02. Connect Your Broker` — Authorize Zerodha, Dhan, Upstox, Angel One, or Fyers API key.
  3. `03. Launch & Trade` — Access live charts and execute hotkey orders.

### Section 8: Pricing
- **Visual Style:** 2-column primary pricing grid (Starter ₹0 vs. Pro Scalper ₹999/mo) + Modular Add-ons explainer container.
- **Philosophy:** Clear base platform price + independent pricing for future modular extensions (Scalper Overdrive, AI, Models, CoreSpirit).

### Section 9: Future Modules (Roadmap Preview)
- **Visual Style:** 6-card grid with monospace phase badges (`PHASE 02` through `PHASE 07`).
- **Phases:** Marketplace, Scalper Overdrive, AI Platform, Market Models, CoreSpirit Scripting Runtime, and CoreSpirit Marketplace.

### Section 10: FAQ
- **Visual Style:** Single-column accordion container (`max-width: 800px`) with smooth height expansions for 6 essential technical/security questions.

### Section 11: Footer
- **Visual Style:** Deepest dark background (`#06070a`), 4-column directory links, official SEBI regulatory compliance disclaimer, and live system latency telemetry bar (`🟢 All Broker APIs Operational · Latency 14ms`).

---

**End of LANDING_PAGE_SPECIFICATION.md**
