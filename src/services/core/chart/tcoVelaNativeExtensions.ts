import {
  registerNativeIndicator,
  registerRendererLayer,
  type NativeIndicator,
  type NativeIndicatorContext,
  type NativeIndicatorDescriptor,
  type InputSchema,
  type InputValue,
  type RendererLayerDefinition,
  type RendererLayerArgs,
} from '../../../../vendor/vela/src/plugin';

type RegimeLayerData = {
  state: -1 | 0 | 1;
  bullColor: string;
  bearColor: string;
  flatColor: string;
  opacity: number;
};

const DEFAULT_LENGTH = 20;
const DEFAULT_BULL = '#22c55e';
const DEFAULT_BEAR = '#ef4444';
const DEFAULT_FLAT = '#64748b';
const DEFAULT_OPACITY = 0.72;

const regimeLayer: RendererLayerDefinition = {
  id: 'tco-regime-ribbon',
  placement: 'below-data',
  repaintOnCursor: false,
  create() {
    let canvas: HTMLCanvasElement | null = null;
    return {
      mount(nextCanvas) {
        canvas = nextCanvas;
      },
      render(args: RendererLayerArgs) {
        if (!canvas) return;
        const g = canvas.getContext('2d');
        if (!g) return;
        const dpr = args.coords.dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, args.coords.width, args.coords.height);

        const data = args.data as Partial<RegimeLayerData> | undefined;
        const state = data?.state;
        if (state !== -1 && state !== 0 && state !== 1) return;

        const color = state > 0
          ? String(data?.bullColor || args.theme.upColor || DEFAULT_BULL)
          : state < 0
            ? String(data?.bearColor || args.theme.downColor || DEFAULT_BEAR)
            : String(data?.flatColor || DEFAULT_FLAT);
        const opacity = Math.max(0.08, Math.min(1, Number(data?.opacity ?? DEFAULT_OPACITY)));
        g.globalAlpha = opacity;
        g.fillStyle = color;
        g.fillRect(0, args.bounds.top, args.coords.width, Math.min(4, Math.max(2, args.bounds.height * 0.008)));
        g.globalAlpha = 1;
      },
      destroy() {
        canvas = null;
      },
    };
  },
};

registerRendererLayer(regimeLayer);

class TcoRegimeRibbonIndicator implements NativeIndicator {
  private ctx: NativeIndicatorContext | null = null;
  private inputs: Record<string, InputValue> = {};

  start(ctx: NativeIndicatorContext, inputs: Record<string, InputValue>): void {
    this.ctx = ctx;
    this.inputs = inputs;
    this.recompute();
    ctx.setStatus(ctx.live ? 'live' : 'idle');
  }

  onBars(): void {
    this.recompute();
  }

  onViewport(): void {}

  setInputs(inputs: Record<string, InputValue>): void {
    this.inputs = inputs;
    this.recompute();
  }

  suspend(): void {}

  resume(): void {
    this.recompute();
  }

  stop(): void {
    this.ctx = null;
  }

  private recompute(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const bars = ctx.bars();
    const length = Math.max(2, Math.min(500, Math.floor(Number(this.inputs.length) || DEFAULT_LENGTH)));
    const last = bars.length - 1;
    if (last < 1) {
      ctx.pushData({
        state: 0,
        bullColor: String(this.inputs.bullColor || DEFAULT_BULL),
        bearColor: String(this.inputs.bearColor || DEFAULT_BEAR),
        flatColor: String(this.inputs.flatColor || DEFAULT_FLAT),
        opacity: Number(this.inputs.opacity ?? DEFAULT_OPACITY),
      } satisfies RegimeLayerData);
      return;
    }

    const anchor = Math.max(0, last - length);
    const close = Number(bars[last]?.close);
    const prior = Number(bars[anchor]?.close);
    const state: -1 | 0 | 1 = !Number.isFinite(close) || !Number.isFinite(prior)
      ? 0
      : close > prior
        ? 1
        : close < prior
          ? -1
          : 0;

    ctx.pushData({
      state,
      bullColor: String(this.inputs.bullColor || DEFAULT_BULL),
      bearColor: String(this.inputs.bearColor || DEFAULT_BEAR),
      flatColor: String(this.inputs.flatColor || DEFAULT_FLAT),
      opacity: Number(this.inputs.opacity ?? DEFAULT_OPACITY),
    } satisfies RegimeLayerData);
  }
}

const regimeInputs = (): InputSchema[] => [
  { key: 'length', title: 'Lookback', type: 'int', defval: DEFAULT_LENGTH, min: 2, max: 500, step: 1 },
  { key: 'bullColor', title: 'Bull color', type: 'color', defval: DEFAULT_BULL },
  { key: 'bearColor', title: 'Bear color', type: 'color', defval: DEFAULT_BEAR },
  { key: 'flatColor', title: 'Flat color', type: 'color', defval: DEFAULT_FLAT },
  { key: 'opacity', title: 'Opacity', type: 'float', defval: DEFAULT_OPACITY, min: 0.1, max: 1, step: 0.05 },
];

const regimeDescriptor: NativeIndicatorDescriptor = {
  type: 'tco-regime-ribbon',
  title: 'TCO Regime Ribbon',
  shortTitle: 'TCO Regime',
  paneHint: 'price',
  overlay: true,
  multiInstance: true,
  inputsSchema: regimeInputs,
  defaultInputs: () => ({
    length: DEFAULT_LENGTH,
    bullColor: DEFAULT_BULL,
    bearColor: DEFAULT_BEAR,
    flatColor: DEFAULT_FLAT,
    opacity: DEFAULT_OPACITY,
  }),
  create: () => new TcoRegimeRibbonIndicator(),
};

registerNativeIndicator(regimeDescriptor);

export const TCO_VELA_NATIVE_INDICATOR_TYPES = Object.freeze([
  regimeDescriptor.type,
]);
