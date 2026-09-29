import { LiveTradingWorkspace } from './LiveTradingWorkspace';

/**
 * Canonical /live terminal host. The workspace owns the chart shell and docked
 * terminal UI; no second modal controller is mounted here.
 */
export function LiveTradingTerminal() {
  return <LiveTradingWorkspace />;
}

export default LiveTradingTerminal;
