import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ShieldCheck,
  Zap,
  Layers,
  Activity,
  Sliders,
  Maximize2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  BarChart2,
  Command,
  X,
  Link2,
  ShieldAlert
} from 'lucide-react';
import { WatchlistItem, PositionItem } from '../../types/landing';
import { useDemoMode } from '../../context/DemoModeContext';
import { BrokerRequiredModal } from './BrokerRequiredModal';

import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';

interface FullWorkspaceViewProps {
  onBackToLanding: () => void;
  onNavigateToBroker?: () => void;
}

export const FullWorkspaceView: React.FC<FullWorkspaceViewProps> = ({
  onBackToLanding,
  onNavigateToBroker,
}) => {
  const {
    isDemoMode,
    connectedBroker,
    isBrokerModalOpen,
    brokerModalMessage,
    openBrokerRequiredModal,
    closeBrokerRequiredModal,
    setConnectedBroker,
  } = useDemoMode();

  const [selectedSymbol, setSelectedSymbol] = useState('BANKNIFTY');
  const [orderType, setOrderType] = useState<'Market' | 'Limit' | 'SL' | 'SL-M'>('Market');
  const [orderSide, setOrderSide] = useState<'Buy' | 'Sell'>('Buy');
  const [quantity, setQuantity] = useState(25);
  const [positions, setPositions] = useState<PositionItem[]>([
    { id: '1', symbol: 'BANKNIFTY 25 SEP 47500 CE', type: 'NRML', lots: 25, pnl: 2850.0, ltp: 312.45 },
    { id: '2', symbol: 'NIFTY 25 SEP 22200 PE', type: 'NRML', lots: 25, pnl: -1125.0, ltp: 186.3 },
  ]);
  const [notification, setNotification] = useState<string | null>(null);

  const totalPnL = positions.reduce((acc, curr) => acc + curr.pnl, 0);

  const handleOrderExecutionAttempt = () => {
    // If running in Demo Mode (no broker connected), require broker connection modal
    if (isDemoMode) {
      openBrokerRequiredModal('Connect a broker to execute live trades.');
      return;
    }

    // If broker is connected, trigger order
    triggerOrder();
  };

  const triggerOrder = async () => {
    const activeBroker = tradingCoreRuntime.getPrimaryBroker();
    const result = await tradingCoreRuntime.placeOrder({
      symbol: selectedSymbol,
      side: orderSide,
      quantity,
      orderType,
      product: 'MIS',
    });

    const newPos: PositionItem = {
      id: Date.now().toString(),
      symbol: `${selectedSymbol} 25 SEP CE`,
      type: 'NRML',
      lots: quantity,
      pnl: 0,
      ltp: 315.0,
    };
    setPositions([newPos, ...positions]);
    const brokerName = activeBroker ? activeBroker.name : connectedBroker || 'Broker';
    showNotification(`ORDER FILLED: ${orderSide} ${quantity} Qty ${selectedSymbol} (${brokerName} Runtime)`);
  };

  const squareOffPosition = async (id: string) => {
    if (isDemoMode) {
      openBrokerRequiredModal('Connect a broker to execute live trades.');
      return;
    }
    await tradingCoreRuntime.cancelOrder(id);
    setPositions(positions.filter((p) => p.id !== id));
    showNotification('POSITION SQUARED OFF');
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setOrderSide('Buy');
        handleOrderExecutionAttempt();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setOrderSide('Sell');
        handleOrderExecutionAttempt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSymbol, connectedBroker, isDemoMode, quantity]);

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans flex flex-col">
      {/* Top Banner when in Explore Mode */}
      {isDemoMode && (
        <div className="bg-[#0c0e15] border-b border-[#222636] px-4 py-3 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-[#8c93a6] gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2.5 py-0.5 rounded text-[10px]">
                Explore Mode
              </span>
              <span className="text-[#f3f4f6] font-medium text-[11px]">
                TradingCore is running in demonstration mode.
              </span>
            </div>
            <span className="text-[#8c93a6] hidden lg:inline">
              Connect a broker anytime to enable live market data, portfolio synchronization, and order execution.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Explore Capability Checklist Toggle */}
            <div className="relative group">
              <button className="px-2.5 py-1 rounded border border-[#222636] bg-[#11131c] text-[10px] text-[#8c93a6] hover:text-[#f3f4f6] cursor-pointer">
                View Access
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-64 p-3 bg-[#0c0e15] border border-[#222636] rounded-xl shadow-2xl z-50 text-[11px] font-mono space-y-2">
                <div className="font-bold text-[#f3f4f6] border-b border-[#222636] pb-1">Explore Mode Capabilities</div>
                <div className="space-y-1 text-[#10b981]">
                  <div>✓ Watch Markets</div>
                  <div>✓ Build Layouts</div>
                  <div>✓ Test Hotkeys</div>
                  <div>✓ Paper Trade (Future)</div>
                  <div>✓ Browse Marketplace</div>
                </div>
                <div className="space-y-1 text-[#ef4444] pt-1 border-t border-[#222636]">
                  <div>✗ Live Trading</div>
                  <div>✗ Orders</div>
                  <div>✗ Portfolio</div>
                  <div>✗ Positions</div>
                </div>
              </div>
            </div>

            {onNavigateToBroker && (
              <button
                onClick={onNavigateToBroker}
                className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-3 py-1.5 text-xs font-bold text-[#090a0f] hover:bg-[#059669] transition-colors cursor-pointer"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span>Connect Broker</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top OS Header Bar */}
      <header className="h-14 border-b border-[#222636] bg-[#0c0e15] px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToLanding}
            className="flex items-center gap-1.5 rounded-lg border border-[#222636] bg-[#11131c] px-3 py-1.5 text-xs font-mono text-[#8c93a6] hover:text-[#f3f4f6] hover:border-[#333a52] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Landing</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#10b981]/10 text-[#10b981] font-bold font-mono text-xs border border-[#10b981]/20">
              TC
            </div>
            <span className="font-bold text-sm tracking-tight hidden sm:inline">TradingCore OS</span>
            {isDemoMode ? (
              <span className="rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2.5 py-0.5 font-mono text-[10px] text-[#f59e0b] font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
                DEMO MODE
              </span>
            ) : (
              <span className="rounded-full bg-[#10b981]/10 border border-[#10b981]/30 px-2.5 py-0.5 font-mono text-[10px] text-[#10b981] font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                LIVE BROKER ACTIVE
              </span>
            )}
          </div>
        </div>

        {/* Broker Switcher / Connection Status Pill */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {isDemoMode ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#222636] bg-[#090a0f] px-3 py-1.5">
              <span className="text-[11px] text-[#8c93a6] font-semibold">Broker Status:</span>
              <span className="text-[11px] font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/20">
                No broker connected
              </span>
              {onNavigateToBroker && (
                <button
                  onClick={onNavigateToBroker}
                  className="flex items-center gap-1 rounded bg-[#10b981] px-2.5 py-1 text-[11px] font-bold text-[#090a0f] hover:bg-[#059669] transition-colors cursor-pointer"
                >
                  <Link2 className="h-3 w-3" />
                  <span>Connect Broker</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[#8c93a6] text-[11px] hidden sm:inline">Active Broker:</span>
              <div className="flex items-center gap-1 rounded-lg border border-[#222636] bg-[#090a0f] p-1">
                {['Zerodha', 'Dhan', 'Upstox', 'Angel One', 'Fyers'].map((broker) => (
                  <button
                    key={broker}
                    onClick={() => {
                      setConnectedBroker(broker);
                      showNotification(`CONNECTED TO BROKER: ${broker}`);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      connectedBroker === broker
                        ? 'bg-[#10b981] text-[#090a0f] font-bold'
                        : 'text-[#8c93a6] hover:text-[#f3f4f6]'
                    }`}
                  >
                    {broker}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hotkey Indicator */}
        <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-[#8c93a6]">
          <span className="rounded bg-[#11131c] border border-[#222636] px-2 py-0.5 text-[#10b981]">
            Ctrl+B (Buy)
          </span>
          <span className="rounded bg-[#11131c] border border-[#222636] px-2 py-0.5 text-[#ef4444]">
            Ctrl+S (Sell)
          </span>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-16 right-6 z-50 rounded-xl border border-[#10b981] bg-[#0c0e15] px-4 py-3 font-mono text-xs text-[#10b981] shadow-2xl flex items-center gap-2"
        >
          <Zap className="h-4 w-4 text-[#10b981]" />
          <span>{notification}</span>
        </motion.div>
      )}

      {/* Broker Required Modal for Demo Mode Actions */}
      <BrokerRequiredModal
        isOpen={isBrokerModalOpen}
        message={brokerModalMessage}
        onClose={closeBrokerRequiredModal}
        onConnectBroker={() => {
          if (onNavigateToBroker) {
            onNavigateToBroker();
          }
        }}
      />

      {/* Workspace Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 bg-[#090a0f]">
        {/* Watchlist Panel */}
        <div className="lg:col-span-3 border-r border-[#222636] bg-[#0c0e15] flex flex-col justify-between">
          <div>
            <div className="p-3 border-b border-[#222636] font-mono text-xs font-bold text-[#f3f4f6] flex justify-between items-center">
              <span>WATCHLIST</span>
              <span className="text-[10px] text-[#10b981] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                SIMULATED FEED
              </span>
            </div>
            <div className="divide-y divide-[#222636]/30 font-mono text-xs">
              {[
                { symbol: 'BANKNIFTY', ltp: 47312.25, chg: '+1.25%' },
                { symbol: 'NIFTY 50', ltp: 22124.70, chg: '+0.87%' },
                { symbol: 'FINNIFTY', ltp: 21281.10, chg: '+0.72%' },
                { symbol: 'RELIANCE', ltp: 2956.80, chg: '-0.12%' },
                { symbol: 'TCS', ltp: 3544.90, chg: '+0.31%' },
                { symbol: 'HDFCBANK', ltp: 1643.25, chg: '+0.28%' },
              ].map((item) => (
                <div
                  key={item.symbol}
                  onClick={() => setSelectedSymbol(item.symbol)}
                  className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${
                    selectedSymbol === item.symbol
                      ? 'bg-[#181b28] border-l-2 border-[#10b981]'
                      : 'hover:bg-[#11131c]'
                  }`}
                >
                  <span className="font-bold text-[#f3f4f6]">{item.symbol}</span>
                  <span className="text-[#e5e7eb]">₹{item.ltp.toLocaleString('en-IN')}</span>
                  <span className={item.chg.startsWith('+') ? 'text-[#10b981] font-semibold' : 'text-[#ef4444] font-semibold'}>
                    {item.chg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 border-t border-[#222636] font-mono text-xs bg-[#090a0f]">
            <span className="text-[#8c93a6] block mb-1">TOTAL P&L (SIMULATED POSITIONS)</span>
            <span className={`text-lg font-bold ${totalPnL >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {totalPnL >= 0 ? `+₹${totalPnL.toFixed(2)}` : `-₹${Math.abs(totalPnL).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Main Chart Window */}
        <div className="lg:col-span-6 border-r border-[#222636] bg-[#090a0f] p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center pb-3 border-b border-[#222636] font-mono text-xs">
            <span className="font-bold text-base text-[#f3f4f6]">{selectedSymbol} · 5m · NSE</span>
            <span className="text-[#10b981] font-bold">LTP: ₹47,312.25 (+1.25%)</span>
          </div>

          <div className="flex-1 my-4 flex flex-col items-center justify-center border border-[#222636]/60 rounded-xl bg-[#0c0e15] p-6 text-center space-y-4">
            <Activity className="h-12 w-12 text-[#10b981] animate-pulse" />
            <h3 className="text-lg font-bold text-[#f3f4f6]">
              {selectedSymbol} Live Candlestick Feed Active
            </h3>
            <p className="text-xs text-[#8c93a6] max-w-md">
              {isDemoMode
                ? 'Streaming high-frequency simulated L2 tick dataset. Hotkeys Ctrl+B (Buy) and Ctrl+S (Sell) active.'
                : `TradingView WebGL engine streaming direct L2 ticks from ${connectedBroker} API. Hotkeys Ctrl+B (Buy) and Ctrl+S (Sell) active.`}
            </p>
          </div>

          <div className="flex justify-between font-mono text-xs text-[#8c93a6]">
            <span>Target: ₹47,450.00</span>
            <span>Entry: ₹47,311.25</span>
            <span>Stop Loss: ₹47,000.00</span>
          </div>
        </div>

        {/* Order Form & Positions Panel */}
        <div className="lg:col-span-3 bg-[#0c0e15] p-4 flex flex-col justify-between font-mono text-xs space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#222636] pb-2 mb-3">
              <span className="font-bold text-[#f3f4f6]">
                QUICK ORDER ENTRY
              </span>
              {isDemoMode && (
                <span className="text-[9px] font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 py-0.5 rounded border border-[#f59e0b]/20">
                  DEMO MODE
                </span>
              )}
            </div>

            {/* Side Switcher */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setOrderSide('Buy')}
                className={`py-2 rounded font-bold transition-colors cursor-pointer ${
                  orderSide === 'Buy'
                    ? 'bg-[#10b981] text-[#090a0f]'
                    : 'bg-[#11131c] border border-[#222636] text-[#8c93a6]'
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setOrderSide('Sell')}
                className={`py-2 rounded font-bold transition-colors cursor-pointer ${
                  orderSide === 'Sell'
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-[#11131c] border border-[#222636] text-[#8c93a6]'
                }`}
              >
                SELL
              </button>
            </div>

            {/* Quantity */}
            <div className="mb-4 space-y-1">
              <label className="text-[10px] text-[#8c93a6]">QUANTITY (LOTS)</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full rounded border border-[#222636] bg-[#090a0f] p-2 text-xs font-bold text-[#f3f4f6]"
              />
            </div>

            <button
              onClick={handleOrderExecutionAttempt}
              className={`w-full py-3 rounded font-bold uppercase transition-all cursor-pointer shadow-lg ${
                orderSide === 'Buy'
                  ? 'bg-[#10b981] text-[#090a0f] hover:bg-[#059669]'
                  : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
              }`}
            >
              {isDemoMode
                ? `EXECUTE ${orderSide} (LIVE BROKER REQUIRED)`
                : `EXECUTE ${orderSide} (${connectedBroker})`}
            </button>
          </div>

          {/* Active Positions */}
          <div>
            <span className="font-bold text-[#f3f4f6] block mb-2 border-b border-[#222636] pb-1">
              OPEN POSITIONS ({positions.length})
            </span>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {positions.map((pos) => (
                <div key={pos.id} className="p-2 border border-[#222636] rounded bg-[#090a0f] flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[#f3f4f6] block">{pos.symbol}</span>
                    <span className="text-[10px] text-[#8c93a6]">{pos.lots} Lots</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold block ${pos.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                      ₹{pos.pnl.toFixed(2)}
                    </span>
                    <button
                      onClick={() => squareOffPosition(pos.id)}
                      className="text-[9px] text-[#ef4444] hover:underline cursor-pointer"
                    >
                      Exit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

