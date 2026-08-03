import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ShieldCheck,
  Zap,
  Activity,
  Settings,
  Link2,
} from 'lucide-react';
import { PositionItem } from '../../types/landing';
import { BrokerSettingsModal } from '../brokers/BrokerSettingsModal';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';

interface FullWorkspaceViewProps {
  onBackToLanding: () => void;
  onNavigateToBroker?: () => void;
}

export const FullWorkspaceView: React.FC<FullWorkspaceViewProps> = ({
  onBackToLanding,
  onNavigateToBroker,
}) => {
  const [activeBrokerInfo, setActiveBrokerInfo] = useState(() => tradingCoreRuntime.getPrimaryBrokerInfo());
  const [selectedSymbol, setSelectedSymbol] = useState('BANKNIFTY');
  const [orderType, setOrderType] = useState<'Market' | 'Limit' | 'SL' | 'SL-M'>('Market');
  const [orderSide, setOrderSide] = useState<'Buy' | 'Sell'>('Buy');
  const [quantity, setQuantity] = useState(25);
  const [positions, setPositions] = useState<PositionItem[]>([
    { id: '1', symbol: 'BANKNIFTY 25 SEP 47500 CE', type: 'NRML', lots: 25, pnl: 2850.0, ltp: 312.45 },
    { id: '2', symbol: 'NIFTY 25 SEP 22200 PE', type: 'NRML', lots: 25, pnl: -1125.0, ltp: 186.3 },
  ]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isBrokerSettingsOpen, setIsBrokerSettingsOpen] = useState(false);

  const totalPnL = positions.reduce((acc, curr) => acc + curr.pnl, 0);

  useEffect(() => {
    const syncBrokerInfo = () => {
      setActiveBrokerInfo(tradingCoreRuntime.getPrimaryBrokerInfo());
    };
    syncBrokerInfo();
    const unsub = tradingCoreRuntime.on('STATUS_CHANGED', syncBrokerInfo);
    return () => {
      unsub();
    };
  }, []);

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
    const brokerName = activeBroker ? activeBroker.name : activeBrokerInfo?.name || 'Broker';
    showNotification(`ORDER FILLED: ${orderSide} ${quantity} Qty ${selectedSymbol} (${brokerName} Engine)`);
  };

  const squareOffPosition = async (id: string) => {
    await tradingCoreRuntime.cancelOrder(id);
    setPositions(positions.filter((p) => p.id !== id));
    showNotification('POSITION SQUARED OFF');
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setOrderSide('Buy');
        triggerOrder();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setOrderSide('Sell');
        triggerOrder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSymbol, quantity]);

  const activeBrokerName = activeBrokerInfo?.name || 'Live Broker';

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] font-sans flex flex-col">
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
            <span className="rounded-full bg-[#10b981]/10 border border-[#10b981]/30 px-2.5 py-0.5 font-mono text-[10px] text-[#10b981] font-bold flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              LIVE BROKER ACTIVE: {activeBrokerName}
            </span>
          </div>
        </div>

        {/* Broker Switcher / Settings */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#8c93a6] text-[11px] hidden sm:inline">Connected Broker:</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-[#222636] bg-[#090a0f] px-3 py-1 text-xs font-bold text-[#10b981]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
              <span>{activeBrokerName}</span>
            </div>
          </div>

          {onNavigateToBroker && (
            <button
              onClick={onNavigateToBroker}
              className="flex items-center gap-1.5 rounded-lg border border-[#222636] bg-[#11131c] px-3 py-1.5 text-xs text-[#8c93a6] hover:text-[#f3f4f6] hover:border-[#33384f] transition-colors cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Manage Connections</span>
            </button>
          )}

          <button
            onClick={() => setIsBrokerSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#222636] bg-[#11131c] px-3 py-1.5 text-xs text-[#8c93a6] hover:text-[#f3f4f6] hover:border-[#33384f] transition-colors cursor-pointer"
            title="Broker Runtime Settings"
          >
            <Settings className="h-3.5 w-3.5 text-[#10b981]" />
            <span className="hidden sm:inline">Broker Settings</span>
          </button>
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

      {/* Broker Runtime Settings Modal */}
      <BrokerSettingsModal
        isOpen={isBrokerSettingsOpen}
        onClose={() => setIsBrokerSettingsOpen(false)}
        onNavigateToConnect={onNavigateToBroker}
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
                BROKER STREAM
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
            <span className="text-[#8c93a6] block mb-1">TOTAL P&L (LIVE POSITIONS)</span>
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
              {selectedSymbol} Live Candlestick Feed
            </h3>
            <p className="text-xs text-[#8c93a6] max-w-md">
              TradingView WebGL engine streaming direct L2 ticks from {activeBrokerName} API. Hotkeys Ctrl+B (Buy) and Ctrl+S (Sell) active.
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
              <span className="text-[10px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/20 font-bold">
                BROKER CONNECTED
              </span>
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
              onClick={triggerOrder}
              className={`w-full py-3 rounded font-bold uppercase transition-all cursor-pointer shadow-lg ${
                orderSide === 'Buy'
                  ? 'bg-[#10b981] text-[#090a0f] hover:bg-[#059669]'
                  : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
              }`}
            >
              EXECUTE {orderSide} ({activeBrokerName})
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
