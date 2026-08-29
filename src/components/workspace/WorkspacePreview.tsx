import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp,
  Sliders,
  Maximize2,
  Plus,
  Layers,
  Activity,
  Crosshair,
  TrendingDown,
  Lock,
  Search,
  Bell,
  RotateCcw,
  Settings,
  Pencil,
  Type,
  Square,
  Ruler,
  Magnet,
  Eye,
  Trash2,
  BarChart2
} from 'lucide-react';
import { WatchlistItem, DepthRow, PositionItem } from '../../types/landing';

const WATCHLIST_DATA: WatchlistItem[] = [
  { symbol: 'NIFTY 50', ltp: 22124.70, change: 191.50, changePercent: 0.87 },
  { symbol: 'BANKNIFTY', ltp: 47312.25, change: 585.10, changePercent: 1.25 },
  { symbol: 'FINNIFTY', ltp: 21281.10, change: 152.30, changePercent: 0.72 },
  { symbol: 'RELIANCE', ltp: 2956.80, change: -3.55, changePercent: -0.12 },
  { symbol: 'TCS', ltp: 3544.90, change: 10.90, changePercent: 0.31 },
  { symbol: 'HDFCBANK', ltp: 1643.25, change: 4.55, changePercent: 0.28 },
  { symbol: 'INFY', ltp: 1572.40, change: -1.75, changePercent: -0.11 },
  { symbol: 'ICICIBANK', ltp: 1106.60, change: 4.85, changePercent: 0.44 },
];

const DEPTH_DATA: DepthRow[] = [
  { bidQty: 25, bidPrice: 47310.65, askPrice: 47310.90, askQty: 15 },
  { bidQty: 40, bidPrice: 47310.40, askPrice: 47311.25, askQty: 35 },
  { bidQty: 60, bidPrice: 47310.15, askPrice: 47311.50, askQty: 50 },
  { bidQty: 75, bidPrice: 47309.85, askPrice: 47311.85, askQty: 65 },
  { bidQty: 100, bidPrice: 47309.50, askPrice: 47312.10, askQty: 80 },
];

const POSITIONS_DATA: PositionItem[] = [
  { id: '1', symbol: 'BANKNIFTY 25 SEP 47500 CE', type: 'NRML', lots: 25, pnl: 2850.00, ltp: 312.45 },
  { id: '2', symbol: 'NIFTY 25 SEP 22200 PE', type: 'NRML', lots: 25, pnl: -1125.00, ltp: 186.30 },
];

const CANDLES = [
  { time: '10:00', open: 47120, high: 47180, low: 47090, close: 47160, volume: 1420 },
  { time: '10:30', open: 47160, high: 47210, low: 47140, close: 47190, volume: 2100 },
  { time: '11:00', open: 47190, high: 47250, low: 47170, close: 47240, volume: 3450 },
  { time: '11:30', open: 47240, high: 47230, low: 47180, close: 47200, volume: 1890 },
  { time: '12:00', open: 47200, high: 47280, low: 47190, close: 47270, volume: 2900 },
  { time: '12:30', open: 47270, high: 47260, low: 47210, close: 47230, volume: 1650 },
  { time: '13:00', open: 47230, high: 47340, low: 47220, close: 47320, volume: 4120 },
  { time: '13:30', open: 47320, high: 47380, low: 47300, close: 47360, volume: 3800 },
  { time: '14:00', open: 47360, high: 47350, low: 47280, close: 47290, volume: 2200 },
  { time: '14:30', open: 47290, high: 47420, low: 47280, close: 47400, volume: 5200 },
  { time: '15:00', open: 47400, high: 47410, low: 47300, close: 47312.25, volume: 3100 },
];

export const WorkspacePreview: React.FC<{ onLaunch?: () => void }> = ({ onLaunch }) => {
  const [selectedSymbol, setSelectedSymbol] = useState('BANKNIFTY');
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const [orderType, setOrderType] = useState<'Market' | 'Limit' | 'SL' | 'SL-M'>('Market');
  const [orderSide, setOrderSide] = useState<'Buy' | 'Sell'>('Buy');
  const [quantity, setQuantity] = useState(25);
  const [activeTab, setActiveTab] = useState<'Order' | 'Positions'>('Order');
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<string | null>(null);

  const minPrice = 46900;
  const maxPrice = 47600;
  const priceRange = maxPrice - minPrice;
  const chartHeight = 320;
  const chartWidth = 620;

  const getSvgY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * (chartHeight - 50) - 25;
  };

  const targetY = getSvgY(47450);
  const entryY = getSvgY(47311.25);
  const stopLossY = getSvgY(47000);

  return (
    <div id="workspace-preview" className="w-full max-w-[1440px] mx-auto my-12 px-2 sm:px-4">
      {/* Container Frame with refined institutional styling */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-[#1e2230] bg-[#0c0e15] shadow-2xl shadow-black/90 ring-1 ring-white/5"
      >
        {/* TradingView Top Navigation Bar */}
        <div className="flex h-11 items-center justify-between border-b border-[#1e2230] bg-[#11131c] px-3 font-mono text-xs text-[#8c93a6]">
          {/* Left: Window Dots & Symbol Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]/60" />
            </div>

            <div className="h-4 w-[1px] bg-[#1e2230]" />

            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="font-bold text-[#f3f4f6]">BANKNIFTY</span>
              <span className="text-[10px] text-[#585e72]">NSE · F&O</span>
            </div>
          </div>

          {/* Center: TradingView Toolbar Options */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded border border-[#1e2230] bg-[#090a0f] p-0.5">
              {['1m', '3m', '5m', '15m', '1h', '4h', '1D'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                    selectedTimeframe === tf
                      ? 'bg-[#181b28] text-[#f3f4f6] font-bold'
                      : 'hover:text-[#f3f4f6]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="h-4 w-[1px] bg-[#1e2230]" />

            <button className="flex items-center gap-1.5 rounded border border-[#1e2230] bg-[#090a0f] px-2 py-1 text-[11px] hover:text-[#f3f4f6]">
              <Activity className="h-3.5 w-3.5 text-[#3b82f6]" />
              <span>Indicators (fx)</span>
            </button>

            <button className="flex items-center gap-1 rounded border border-[#1e2230] bg-[#090a0f] px-2 py-1 text-[11px] hover:text-[#f3f4f6]">
              <Bell className="h-3.5 w-3.5" />
              <span>Alert</span>
            </button>

            <button className="flex items-center gap-1 rounded border border-[#1e2230] bg-[#090a0f] px-2 py-1 text-[11px] hover:text-[#f3f4f6]">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Replay</span>
            </button>
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 cursor-pointer hover:text-[#f3f4f6]" />
            <Maximize2 className="h-3.5 w-3.5 cursor-pointer hover:text-[#f3f4f6]" />
            <button
              onClick={onLaunch}
              className="rounded bg-[#10b981] px-2.5 py-1 text-[11px] font-bold text-[#090a0f] hover:bg-[#059669]"
            >
              Connect
            </button>
          </div>
        </div>

        {/* Workspace 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px] bg-[#090a0f]">
          {/* COLUMN 1: Watchlist & Market Depth */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-[#1e2230] bg-[#0c0e15] flex flex-col justify-between">
            {/* Watchlist Section */}
            <div>
              <div className="flex items-center justify-between border-b border-[#1e2230] px-3 py-2 text-xs font-mono text-[#8c93a6]">
                <span className="font-bold text-[#f3f4f6]">Watchlist</span>
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 cursor-pointer hover:text-[#f3f4f6]" />
                  <Sliders className="h-3.5 w-3.5 cursor-pointer hover:text-[#f3f4f6]" />
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#585e72] border-b border-[#1e2230]/60 bg-[#090a0f]">
                <span>Symbol</span>
                <span className="text-right">LTP</span>
                <span className="text-right">Chg%</span>
              </div>

              {/* Watchlist Items */}
              <div className="divide-y divide-[#1e2230]/40">
                {WATCHLIST_DATA.map((item) => {
                  const isSelected = item.symbol === selectedSymbol;
                  const isPositive = item.change >= 0;
                  return (
                    <div
                      key={item.symbol}
                      onClick={() => setSelectedSymbol(item.symbol)}
                      className={`grid grid-cols-3 items-center px-3 py-2 font-mono text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#181b28] text-[#f3f4f6]'
                          : 'hover:bg-[#11131c] text-[#8c93a6]'
                      }`}
                    >
                      <span className={`font-medium ${isSelected ? 'text-[#f3f4f6]' : 'text-[#d1d5db]'}`}>
                        {item.symbol}
                      </span>
                      <span className="text-right font-medium text-[#f3f4f6]">
                        {item.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`text-right font-semibold ${
                          isPositive ? 'text-[#10b981]' : 'text-[#ef4444]'
                        }`}
                      >
                        {isPositive ? `+${item.changePercent}%` : `${item.changePercent}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Market Depth Box (BANKNIFTY) */}
            <div className="border-t border-[#1e2230] bg-[#090a0f] p-3 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#f3f4f6] pb-2 border-b border-[#1e2230]">
                <span>Market Depth ({selectedSymbol})</span>
                <span className="text-[10px] font-normal text-[#585e72]">L2 FEED</span>
              </div>

              <div className="grid grid-cols-6 py-1 text-[9px] uppercase tracking-wider text-[#585e72] border-b border-[#1e2230]/40">
                <span className="text-left">Bid</span>
                <span className="text-right">Qty</span>
                <span className="text-right text-[#10b981]">Price</span>
                <span className="text-left text-[#ef4444] pl-2">Price</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Ask</span>
              </div>

              <div className="space-y-1 pt-1.5 text-[10px]">
                {DEPTH_DATA.map((row, i) => (
                  <div key={i} className="grid grid-cols-6 items-center">
                    <span className="text-[#585e72]">{i + 1}</span>
                    <span className="text-right text-[#8c93a6]">{row.bidQty}</span>
                    <span className="text-right text-[#10b981] font-semibold">
                      {row.bidPrice.toFixed(2)}
                    </span>
                    <span className="text-left text-[#ef4444] font-semibold pl-2">
                      {row.askPrice.toFixed(2)}
                    </span>
                    <span className="text-right text-[#8c93a6]">{row.askQty}</span>
                    <span className="text-right text-[#585e72]">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COLUMN 2: High Precision TradingView Chart Engine */}
          <div className="lg:col-span-6 border-b lg:border-b-0 lg:border-r border-[#1e2230] bg-[#090a0f] flex flex-col justify-between relative overflow-hidden">
            {/* Chart Header Bar */}
            <div className="flex flex-wrap items-center justify-between border-b border-[#1e2230] px-4 py-2 font-mono text-[11px] text-[#8c93a6] bg-[#0c0e15]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[#f3f4f6]">BANKNIFTY · 5 · NSE</span>
                <span>O <strong className="text-[#f3f4f6]">47,281.65</strong></span>
                <span>H <strong className="text-[#10b981]">47,326.50</strong></span>
                <span>L <strong className="text-[#ef4444]">47,275.30</strong></span>
                <span>C <strong className="text-[#f3f4f6]">47,312.25</strong></span>
              </div>
              <span className="text-[#10b981] font-semibold">+30.60 (+0.06%)</span>
            </div>

            {/* TradingView Main Canvas with Tool Toolbar */}
            <div className="relative flex-1 p-1 min-h-[400px] flex items-center justify-center bg-[#090a0f]">
              {/* Left TradingView Tools Sidebar */}
              <div className="absolute left-2 top-2 bottom-2 flex flex-col gap-1.5 rounded border border-[#1e2230] bg-[#11131c]/90 p-1 text-[#8c93a6] z-10 backdrop-blur-sm shadow-lg">
                <Crosshair className="h-3.5 w-3.5 text-[#3b82f6] cursor-pointer" />
                <div className="h-[1px] bg-[#1e2230]" />
                <TrendingUp className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <BarChart2 className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Pencil className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Type className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Square className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Ruler className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Magnet className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Lock className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Eye className="h-3.5 w-3.5 hover:text-[#f3f4f6] cursor-pointer" />
                <Trash2 className="h-3.5 w-3.5 hover:text-[#ef4444] cursor-pointer" />
              </div>

              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full max-h-[420px] overflow-visible"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const x = e.clientX - rect.left;
                  const price = maxPrice - (y / rect.height) * priceRange;
                  setHoverPrice(Math.round(price * 100) / 100);

                  const candleIdx = Math.min(
                    Math.max(0, Math.floor((x - 40) / 48)),
                    CANDLES.length - 1
                  );
                  if (CANDLES[candleIdx]) {
                    setHoverTime(CANDLES[candleIdx].time);
                  }
                }}
                onMouseLeave={() => {
                  setHoverPrice(null);
                  setHoverTime(null);
                }}
              >
                {/* Gridlines */}
                {[47600, 47500, 47400, 47300, 47200, 47100, 47000, 46900].map((p) => {
                  const y = getSvgY(p);
                  return (
                    <g key={p}>
                      <line
                        x1="35"
                        y1={y}
                        x2={chartWidth - 65}
                        y2={y}
                        stroke="#1e2230"
                        strokeDasharray="2 2"
                        strokeWidth="0.8"
                      />
                      <text
                        x={chartWidth - 60}
                        y={y + 3}
                        fill="#585e72"
                        fontSize="9"
                        fontFamily="JetBrains Mono"
                      >
                        {p.toLocaleString('en-IN')}
                      </text>
                    </g>
                  );
                })}

                {/* TARGET ORDER LINE (Green) */}
                <g>
                  <line
                    x1="35"
                    y1={targetY}
                    x2={chartWidth - 65}
                    y2={targetY}
                    stroke="#10b981"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <rect
                    x={chartWidth - 170}
                    y={targetY - 9}
                    width="100"
                    height="18"
                    rx="3"
                    fill="#10b981"
                  />
                  <text
                    x={chartWidth - 120}
                    y={targetY + 3}
                    fill="#090a0f"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                  >
                    Target 47,450 (+2.8R)
                  </text>
                </g>

                {/* ENTRY POSITION LINE (Blue) */}
                <g>
                  <line
                    x1="35"
                    y1={entryY}
                    x2={chartWidth - 65}
                    y2={entryY}
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                  />
                  <rect
                    x={chartWidth - 170}
                    y={entryY - 9}
                    width="100"
                    height="18"
                    rx="3"
                    fill="#3b82f6"
                  />
                  <text
                    x={chartWidth - 120}
                    y={entryY + 3}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                  >
                    Buy 25 @ 47,311.25
                  </text>
                </g>

                {/* STOP LOSS LINE (Red) */}
                <g>
                  <line
                    x1="35"
                    y1={stopLossY}
                    x2={chartWidth - 65}
                    y2={stopLossY}
                    stroke="#ef4444"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <rect
                    x={chartWidth - 170}
                    y={stopLossY - 9}
                    width="100"
                    height="18"
                    rx="3"
                    fill="#ef4444"
                  />
                  <text
                    x={chartWidth - 120}
                    y={stopLossY + 3}
                    fill="#ffffff"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono"
                  >
                    Stop Loss 47,000 (-1.0R)
                  </text>
                </g>

                {/* Candlesticks & Volume Sub-pane */}
                {CANDLES.map((c, index) => {
                  const x = 60 + index * 48;
                  const isBull = c.close >= c.open;
                  const candleColor = isBull ? '#10b981' : '#ef4444';
                  const highY = getSvgY(c.high);
                  const lowY = getSvgY(c.low);
                  const openY = getSvgY(c.open);
                  const closeY = getSvgY(c.close);
                  const bodyY = Math.min(openY, closeY);
                  const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

                  // Volume Bar calculations (Bottom 40px)
                  const volHeight = (c.volume / 6000) * 35;
                  const volY = chartHeight - volHeight - 15;

                  return (
                    <g key={index}>
                      {/* Volume Bar */}
                      <rect
                        x={x - 6}
                        y={volY}
                        width="12"
                        height={volHeight}
                        fill={candleColor}
                        opacity="0.25"
                      />
                      {/* Wick */}
                      <line
                        x1={x}
                        y1={highY}
                        x2={x}
                        y2={lowY}
                        stroke={candleColor}
                        strokeWidth="1.2"
                      />
                      {/* Body */}
                      <rect
                        x={x - 6}
                        y={bodyY}
                        width="12"
                        height={bodyHeight}
                        fill={candleColor}
                        rx="1"
                      />
                      {/* X-axis Time label */}
                      <text
                        x={x}
                        y={chartHeight - 2}
                        fill="#585e72"
                        fontSize="8"
                        fontFamily="JetBrains Mono"
                        textAnchor="middle"
                      >
                        {c.time}
                      </text>
                    </g>
                  );
                })}

                {/* Hover Cursor Crosshair */}
                {hoverPrice !== null && (
                  <g>
                    <line
                      x1="35"
                      y1={getSvgY(hoverPrice)}
                      x2={chartWidth - 65}
                      y2={getSvgY(hoverPrice)}
                      stroke="#8c93a6"
                      strokeDasharray="2 2"
                      strokeWidth="1"
                    />
                    <rect
                      x={chartWidth - 63}
                      y={getSvgY(hoverPrice) - 9}
                      width="60"
                      height="18"
                      fill="#181b28"
                      stroke="#33384f"
                      rx="2"
                    />
                    <text
                      x={chartWidth - 33}
                      y={getSvgY(hoverPrice) + 3}
                      fill="#f3f4f6"
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                      textAnchor="middle"
                    >
                      {hoverPrice.toFixed(2)}
                    </text>
                  </g>
                )}
              </svg>
            </div>

            {/* Timeframe Footer Strip */}
            <div className="flex flex-wrap items-center justify-between border-t border-[#1e2230] px-4 py-1.5 font-mono text-[10px] text-[#8c93a6] bg-[#0c0e15]">
              <div className="flex items-center gap-2">
                {['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', 'All'].map((t) => (
                  <span
                    key={t}
                    className={`cursor-pointer px-1 rounded hover:text-[#f3f4f6] ${
                      t === '1D' ? 'bg-[#181b28] text-[#3b82f6] font-bold' : ''
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[#585e72]">
                <span>15:25:30 (IST)</span>
                <span>log</span>
                <span className="text-[#3b82f6]">auto</span>
              </div>
            </div>
          </div>

          {/* COLUMN 3: Order Entry Panel & Positions */}
          <div className="lg:col-span-3 bg-[#0c0e15] flex flex-col justify-between">
            <div>
              {/* Order / Positions Tabs */}
              <div className="flex items-center border-b border-[#1e2230] font-mono text-xs">
                <button
                  onClick={() => setActiveTab('Order')}
                  className={`flex-1 py-2.5 text-center font-bold transition-colors border-b-2 ${
                    activeTab === 'Order'
                      ? 'border-[#10b981] bg-[#11131c] text-[#f3f4f6]'
                      : 'border-transparent text-[#8c93a6] hover:text-[#f3f4f6]'
                  }`}
                >
                  Order
                </button>
                <button
                  onClick={() => setActiveTab('Positions')}
                  className={`flex-1 py-2.5 text-center font-bold transition-colors border-b-2 ${
                    activeTab === 'Positions'
                      ? 'border-[#10b981] bg-[#11131c] text-[#f3f4f6]'
                      : 'border-transparent text-[#8c93a6] hover:text-[#f3f4f6]'
                  }`}
                >
                  Positions (2)
                </button>
              </div>

              {/* Order Form */}
              {activeTab === 'Order' ? (
                <div className="p-3 space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-[10px] text-[#585e72] uppercase tracking-wider block mb-1">
                      Instrument
                    </label>
                    <div className="flex items-center justify-between rounded border border-[#1e2230] bg-[#090a0f] px-2.5 py-1.5 text-[#f3f4f6]">
                      <span className="font-bold">{selectedSymbol}</span>
                      <span className="rounded bg-[#3b82f6]/10 px-1.5 py-0.5 text-[10px] text-[#3b82f6]">
                        NSE F&O
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#585e72] uppercase tracking-wider block mb-1">
                      Order Type
                    </label>
                    <div className="grid grid-cols-4 gap-1 rounded border border-[#1e2230] bg-[#090a0f] p-1 text-[11px]">
                      {(['Market', 'Limit', 'SL', 'SL-M'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setOrderType(type)}
                          className={`rounded py-1 text-center font-medium transition-colors ${
                            orderType === type
                              ? 'bg-[#181b28] text-[#f3f4f6] font-bold border border-[#33384f]'
                              : 'text-[#8c93a6] hover:text-[#f3f4f6]'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#585e72] uppercase tracking-wider block mb-1">
                      Side
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => setOrderSide('Buy')}
                        className={`rounded py-1.5 text-center font-bold text-xs transition-colors ${
                          orderSide === 'Buy'
                            ? 'bg-[#10b981]/20 border border-[#10b981] text-[#10b981]'
                            : 'border border-[#1e2230] bg-[#090a0f] text-[#8c93a6] hover:text-[#f3f4f6]'
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        onClick={() => setOrderSide('Sell')}
                        className={`rounded py-1.5 text-center font-bold text-xs transition-colors ${
                          orderSide === 'Sell'
                            ? 'bg-[#ef4444]/20 border border-[#ef4444] text-[#ef4444]'
                            : 'border border-[#1e2230] bg-[#090a0f] text-[#8c93a6] hover:text-[#f3f4f6]'
                        }`}
                      >
                        Sell
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-[#585e72] mb-1">
                      <span>Quantity (1 Lot = 15)</span>
                      <span>Max: 900</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-20 rounded border border-[#1e2230] bg-[#090a0f] px-2.5 py-1 text-[#f3f4f6] text-xs font-bold focus:border-[#10b981] focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        {[25, 50, 75, 100].map((q) => (
                          <button
                            key={q}
                            onClick={() => setQuantity(q)}
                            className="rounded border border-[#1e2230] bg-[#090a0f] px-1.5 py-1 text-[10px] text-[#8c93a6] hover:border-[#33384f] hover:text-[#f3f4f6]"
                          >
                            +{q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1e2230]">
                    <div className="flex justify-between text-[11px] mb-2">
                      <span className="text-[#8c93a6]">Est. Margin</span>
                      <span className="font-bold text-[#f3f4f6]">₹ 1,25,650.00</span>
                    </div>

                    <button
                      onClick={onLaunch}
                      className={`w-full rounded py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        orderSide === 'Buy'
                          ? 'bg-[#10b981] text-[#090a0f] hover:bg-[#059669]'
                          : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                      }`}
                    >
                      {orderSide} {orderType.toUpperCase()} (Ctrl+Enter)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2 divide-y divide-[#1e2230]/60 font-mono text-xs">
                  {POSITIONS_DATA.map((pos) => (
                    <div key={pos.id} className="py-2 space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-bold text-[#f3f4f6]">{pos.symbol}</span>
                        <span
                          className={`font-bold ${
                            pos.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                          }`}
                        >
                          {pos.pnl >= 0 ? `+₹${pos.pnl.toFixed(2)}` : `-₹${Math.abs(pos.pnl).toFixed(2)}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-[#8c93a6]">
                        <span>{pos.type} · {pos.lots} Lots</span>
                        <span>LTP: ₹{pos.ltp.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Positions Footer */}
            <div className="border-t border-[#1e2230] bg-[#090a0f] p-3 font-mono text-xs">
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-[#8c93a6]">Total Net P&L</span>
                <span className="font-bold text-[#10b981] text-sm">+₹1,725.00</span>
              </div>
              <div className="flex justify-between text-[10px] text-[#585e72]">
                <span>Hotkeys: <strong className="text-[#f3f4f6]">Ctrl+B / Ctrl+S</strong></span>
                <span className="text-[#3b82f6] cursor-pointer hover:underline" onClick={onLaunch}>
                  Launch Full OS
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
