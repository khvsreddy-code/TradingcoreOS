import type { ChartDataPoint, ColumnarCandleStore } from './chartDataModel';
import type { ChartLodBar, ChartLodIndex } from './chartLevelOfDetail';
import type { ChartRenderer, ChartRendererEnvironment } from './chartRenderer';
import type { ChartScene } from './chartScene';
import { getCurrentTheme, getThemePalette } from '../../../theme/theme';
import { ChartGpuCandleBuffer } from './chartGpuBuffer';

type Rgb = [number, number, number];

function hexToRgb(value: string): Rgb {
  const hex = value.replace('#', '');
  const n = Number.parseInt(hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const value = gl.createShader(type);
  if (!value) throw new Error('WebGL2 shader allocation failed');
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(value) || 'unknown shader error';
    gl.deleteShader(value);
    throw new Error(`WebGL2 shader compile failed: ${info}`);
  }
  return value;
}

function program(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const value = gl.createProgram();
  if (!value) throw new Error('WebGL2 program allocation failed');
  gl.attachShader(value, shader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(value, shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(value);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(value) || 'unknown program error';
    gl.deleteProgram(value);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  return value;
}

/**
 * Experimental retained GPU chart renderer. The native hot path consumes a
 * packed typed-array candle buffer and uses instanced shader transforms, so it
 * does not materialize JS candle objects or rebuild CPU-side geometry every frame.
 */
export class WebGL2ChartRenderer implements ChartRenderer {
  readonly kind = 'webgl2';
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private data: readonly ChartDataPoint[] = [];
  private store: ColumnarCandleStore | null = null;
  private reduced: readonly ChartLodBar[] = [];
  private reducedIndex: ChartLodIndex | null = null;
  private readonly gpuCandleBuffer = new ChartGpuCandleBuffer();
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private cleanupTheme?: () => void;
  private uploadedSourceRevision = -1;
  private uploadedCount = 0;
  private colorUp: Rgb = [1, 1, 1];
  private colorDown: Rgb = [0.94, 0.27, 0.27];

  mount(environment: ChartRendererEnvironment): void {
    if (this.canvas) this.dispose();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'TradingCore GPU chart renderer');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
    environment.mount.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, desynchronized: true });
    if (!gl) { canvas.remove(); throw new Error('WebGL2 is not available in this browser'); }

    const vertex = `#version 300 es\nprecision highp float;\nlayout(location=0) in vec4 a_ohlc;\nlayout(location=1) in float a_volume;\nout vec4 v_color;\nuniform vec2 u_resolution;\nuniform float u_minPrice;\nuniform float u_priceRange;\nuniform float u_count;\nuniform float u_bodyWidth;\nuniform vec4 u_upColor;\nuniform vec4 u_downColor;\nfloat yOf(float price){ return u_resolution.y - ((price-u_minPrice)/u_priceRange)*u_resolution.y; }\nvoid main(){\n  float xStep = u_resolution.x / max(u_count,1.0);\n  float x = float(gl_InstanceID)*xStep + xStep*0.5;\n  float openY=yOf(a_ohlc.x), closeY=yOf(a_ohlc.w), highY=yOf(a_ohlc.y), lowY=yOf(a_ohlc.z);\n  vec2 p;\n  if(gl_VertexID<2){ p=vec2(x, gl_VertexID==0 ? highY : lowY); }\n  else {\n    int v=gl_VertexID-2;\n    float left=x-u_bodyWidth*0.5, right=x+u_bodyWidth*0.5;\n    if(v==0) p=vec2(left,openY); else if(v==1) p=vec2(right,openY); else if(v==2) p=vec2(right,closeY);\n    else if(v==3) p=vec2(left,openY); else if(v==4) p=vec2(right,closeY); else p=vec2(left,closeY);\n  }\n  p /= u_resolution; p=p*2.0-1.0;\n  gl_Position=vec4(p*vec2(1.0,-1.0),0.0,1.0);\n  v_color = a_ohlc.w >= a_ohlc.x ? u_upColor : u_downColor;\n}`;
    const fragment = `#version 300 es\nprecision highp float;\nin vec4 v_color;\nout vec4 outColor;\nvoid main(){outColor=v_color;}`;

    this.canvas = canvas;
    this.gl = gl;
    this.program = program(gl, vertex, fragment);
    this.buffer = gl.createBuffer();
    this.vao = gl.createVertexArray();
    if (!this.buffer || !this.vao) throw new Error('WebGL2 buffer/VAO allocation failed');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = this.gpuCandleBuffer.stride * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 4);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(0, 1); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    this.cleanupTheme = this.bindThemeListener();
    this.resize(environment.width, environment.height, environment.pixelRatio);
  }

  resize(width: number, height: number, pixelRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): void {
    this.width = Math.max(1, Math.floor(width)); this.height = Math.max(1, Math.floor(height)); this.pixelRatio = Math.max(1, pixelRatio);
    if (!this.canvas || !this.gl) return;
    this.canvas.width = Math.max(1, Math.floor(this.width * this.pixelRatio)); this.canvas.height = Math.max(1, Math.floor(this.height * this.pixelRatio));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setCandles(rows: readonly ChartDataPoint[]): void { this.data = rows; this.store = null; }
  setCandlesStore(store: ColumnarCandleStore): void { this.store = store; }
  updateLastCandle(row: ChartDataPoint): void {
    if (!this.store) {
      if (!this.data.length) this.data = [row];
      else { const copy = this.data.slice(); copy[copy.length - 1] = row; this.data = copy; }
    }
  }
  setReducedCandles(rows: readonly ChartLodBar[]): void { this.reduced = rows; this.reducedIndex = null; }
  setReducedCandlesIndex(index: ChartLodIndex): void { this.reducedIndex = index; }
  setScene(scene: ChartScene): void { this.scene = scene; }
  private scene: ChartScene | null = null;

  render(): void {
    const gl = this.gl; const programValue = this.program; const buffer = this.buffer; const vao = this.vao;
    if (!gl || !programValue || !buffer || !vao) return;
    const palette = getThemePalette(getCurrentTheme());
    this.colorUp = hexToRgb(palette.accentSoft); this.colorDown = hexToRgb('#ef4444');
    const bg = hexToRgb(palette.surface2);
    gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);

    const index = this.reducedIndex;
    const count = index?.count ?? this.reduced.length;
    if (!count) return;

    let min = Number.POSITIVE_INFINITY; let max = Number.NEGATIVE_INFINITY;
    if (index) { for (let i = 0; i < index.count; i++) { min = Math.min(min, index.low[i]); max = Math.max(max, index.high[i]); } }
    else { for (const candle of this.reduced) { min = Math.min(min, candle.low); max = Math.max(max, candle.high); } }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    const padding = Math.max((max - min) * 0.04, 1e-9); min -= padding; max += padding;
    const range = Math.max(max - min, 1e-9);

    if (index && this.uploadedSourceRevision !== index.sourceRevision) {
      this.gpuCandleBuffer.sync(index);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (this.uploadedCount === 0 || this.uploadedCount !== this.gpuCandleBuffer.capacity) gl.bufferData(gl.ARRAY_BUFFER, this.gpuCandleBuffer.data, gl.DYNAMIC_DRAW);
      else {
        const fromByte = index.dirtyFromBucket * this.gpuCandleBuffer.stride * 4;
        const toByte = index.dirtyToBucket * this.gpuCandleBuffer.stride * 4;
        if (toByte > fromByte) gl.bufferSubData(gl.ARRAY_BUFFER, fromByte, this.gpuCandleBuffer.data.subarray(index.dirtyFromBucket * this.gpuCandleBuffer.stride, index.dirtyToBucket * this.gpuCandleBuffer.stride));
      }
      this.uploadedCount = this.gpuCandleBuffer.capacity;
      this.uploadedSourceRevision = index.sourceRevision;
    }

    gl.useProgram(programValue); gl.bindVertexArray(vao);
    gl.uniform2f(gl.getUniformLocation(programValue, 'u_resolution'), this.width * this.pixelRatio, this.height * this.pixelRatio);
    gl.uniform1f(gl.getUniformLocation(programValue, 'u_minPrice'), min * 1);
    gl.uniform1f(gl.getUniformLocation(programValue, 'u_priceRange'), range);
    gl.uniform1f(gl.getUniformLocation(programValue, 'u_count'), count);
    gl.uniform1f(gl.getUniformLocation(programValue, 'u_bodyWidth'), Math.max(1, (this.width / count) * 0.58) * this.pixelRatio);
    gl.uniform4f(gl.getUniformLocation(programValue, 'u_upColor'), this.colorUp[0], this.colorUp[1], this.colorUp[2], 1);
    gl.uniform4f(gl.getUniformLocation(programValue, 'u_downColor'), this.colorDown[0], this.colorDown[1], this.colorDown[2], 1);
    gl.drawArraysInstanced(gl.LINES, 0, 2, count);
    gl.drawArraysInstanced(gl.TRIANGLES, 2, 6, count);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.cleanupTheme?.(); this.cleanupTheme = undefined;
    const gl = this.gl;
    if (gl) { if (this.buffer) gl.deleteBuffer(this.buffer); if (this.vao) gl.deleteVertexArray(this.vao); if (this.program) gl.deleteProgram(this.program); }
    this.buffer = null; this.vao = null; this.program = null; this.gl = null;
    this.canvas?.remove(); this.canvas = null;
    this.data = []; this.store = null; this.reduced = []; this.reducedIndex = null; this.scene = null;
    this.gpuCandleBuffer.count = 0; this.gpuCandleBuffer.capacity = 0; this.gpuCandleBuffer.data = new Float32Array(0); this.gpuCandleBuffer.sourceRevision = -1; this.uploadedSourceRevision = -1; this.uploadedCount = 0;
  }

  private bindThemeListener(): () => void { if (typeof window === 'undefined') return () => {}; const listener = () => this.render(); window.addEventListener('tradingcore:theme-change', listener); return () => window.removeEventListener('tradingcore:theme-change', listener); }
}
