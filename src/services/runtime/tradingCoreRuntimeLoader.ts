type TradingCoreRuntimeModule = typeof import('./TradingCoreRuntime');
export type TradingCoreRuntimeApi = TradingCoreRuntimeModule['tradingCoreRuntime'];

let runtimePromise: Promise<TradingCoreRuntimeModule> | undefined;

function importRuntime(): Promise<TradingCoreRuntimeModule> {
  runtimePromise ??= import('./TradingCoreRuntime');
  return runtimePromise;
}

export async function loadTradingCoreRuntime(): Promise<TradingCoreRuntimeApi> {
  const module = await importRuntime();
  return module.tradingCoreRuntime;
}

/**
 * Optional route-transition prefetch. This intentionally does nothing on the
 * landing path unless a caller explicitly requests the protected runtime.
 */
export function preloadTradingCoreRuntime(): void {
  void importRuntime();
}
