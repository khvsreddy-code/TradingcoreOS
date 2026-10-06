export type CoreSpiritChartStoreState = Readonly<{
  open: boolean;
  source: string;
  status: string;
  diagnostics: string[];
}>;

type Listener = () => void;

const DEFAULT_SOURCE = `fast = ema(close, 20)
slow = ema(close, 50)

show fast, slow

when fast crossesAbove slow:
    emit "LONG"`;

export class CoreSpiritStore {
  private state: CoreSpiritChartStoreState = {
    open: false,
    source: typeof window === 'undefined' ? DEFAULT_SOURCE : (window.localStorage.getItem('tradingcore:corespirit:chart-source') || DEFAULT_SOURCE),
    status: '',
    diagnostics: [],
  };
  private listeners = new Set<Listener>();

  getSnapshot(): CoreSpiritChartStoreState { return this.state; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOpen(open: boolean): void { this.update({ open }); }
  setSource(source: string): void { this.update({ source, status: 'Editing' }); }
  setStatus(status: string): void { this.update({ status }); }
  setDiagnostics(diagnostics: string[]): void { this.update({ diagnostics }); }

  resetStatus(): void { this.update({ status: '', diagnostics: [] }); }

  persistSource(): void {
    try { window.localStorage.setItem('tradingcore:corespirit:chart-source', this.state.source); } catch {}
  }

  private update(patch: Partial<CoreSpiritChartStoreState>): void {
    this.state = Object.freeze({ ...this.state, ...patch });
    this.listeners.forEach(listener => listener());
  }
}
