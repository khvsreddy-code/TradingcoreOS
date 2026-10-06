import type { ReactNode, RefObject } from 'react';

export function ChartShell({
  hostRef,
  oscillatorHostRef,
  error,
  historyLoading,
  header,
  toolbar,
  overlay,
  depthPanel,
  children,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  oscillatorHostRef: RefObject<HTMLDivElement | null>;
  error: string;
  historyLoading: boolean;
  header: ReactNode;
  toolbar: ReactNode;
  overlay: ReactNode;
  depthPanel?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {depthPanel}
      {header}
      {error ? (
        <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-xl border border-[#ef4444]/20 bg-[var(--tco-surface)] text-xs text-[#ef4444]">
          {error}
        </div>
      ) : (
        <>
          <div className="relative min-h-[430px] flex-1 overflow-hidden rounded-xl border border-[var(--tco-border)]">
            <div ref={hostRef} className="absolute inset-0" />
            {historyLoading && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2">
                <div className="flex items-center gap-2 rounded-full border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 px-3 py-1.5 font-mono text-[9px] text-[var(--tco-text-2)] shadow-xl backdrop-blur">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--tco-slate)] border-t-[#3b82f6]" />
                  Loading more history…
                </div>
              </div>
            )}
            {overlay}
            {children}
          </div>
          <div ref={oscillatorHostRef} className="mt-2 h-32 overflow-hidden rounded-xl border border-[var(--tco-border)]" />
        </>
      )}
    </div>
  );
}
