import { IChartApi, ISeriesApi, VelaNativeSeriesKernel, LineSeries, Time, createSeriesMarkers } from '../core/chart/velaNativeChartKernel';
import { CoreSpiritOutputFrame } from './outputDispatcher';
import { CoreSpiritObject, CoreSpiritVisualStyle } from './types';
import { CoreSpiritVelaOutputRevisionGate, type CoreSpiritVelaOutputRevision } from './velaOutputAdapter';

/**
 * Stage 3 rich renderer.
 *
 * CoreSpirit emits declarative visual intents; this controller owns the browser-only
 * projection. The Vela renderer owns price/time scales and native series.
 * CoreSpirit stays renderer-neutral and only projects declarative output. A single canvas overlay handles high-cardinality fills, boxes,
 * bands, arrows and symbols so 10k+ visual elements do not become 10k chart series.
 */
type ScheduledObjects = {
  objects: readonly CoreSpiritObject[];
  revision: CoreSpiritVelaOutputRevision;
  resolve: (applied: boolean) => void;
  reject: (error: unknown) => void;
};

function scheduleNextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(callback, 0);
  return () => clearTimeout(handle);
}

export class CoreSpiritChartOutputController {
  private plotSeries = new Map<string, ISeriesApi<'Line'>>();
  private lineSeries = new Map<string, ISeriesApi<'Line'>>();
  private markerPlugin: any = null;
  private candle?: ISeriesApi<'Candlestick'>;
  private host?: HTMLElement;
  private visualCanvas?: HTMLCanvasElement;
  private visualContext?: CanvasRenderingContext2D;
  private labelLayer?: HTMLDivElement;
  private tableLayer?: HTMLDivElement;
  private labelNodes = new Map<string, HTMLDivElement>();
  private lastLabels: Extract<CoreSpiritObject,{kind:'label'}>[] = [];
  private lastFrame?: CoreSpiritOutputFrame;
  private committedObjects: readonly CoreSpiritObject[] = [];
  private disposed = false;
  private readonly outputRevisionGate = new CoreSpiritVelaOutputRevisionGate();
  private pendingScheduledObjects?: ScheduledObjects;
  private cancelScheduledFrame?: () => void;

  constructor(private readonly chart: IChartApi, candle?: ISeriesApi<'Candlestick'>, host?: HTMLElement) {
    this.candle = candle;
    this.host = host;
    this.ensureVisualLayers();
    const ts: any = this.chart.timeScale();
    ts?.subscribeVisibleLogicalRangeChange?.(() => this.refreshOverlay());
    ts?.subscribeVisibleTimeRangeChange?.(() => this.refreshOverlay());
    const c: any = this.chart as any;
    c.subscribeSizeChange?.(() => this.refreshOverlay());
  }

  setCandleSeries(candle: ISeriesApi<'Candlestick'>) { this.candle = candle; this.refreshOverlay(); }
  setHost(host: HTMLElement) { this.host = host; this.ensureVisualLayers(); this.refreshOverlay(); }

  reset(): void {
    for (const s of this.plotSeries.values()) this.remove(s);
    for (const s of this.lineSeries.values()) this.remove(s);
    this.plotSeries.clear(); this.lineSeries.clear();
    try { this.markerPlugin?.setMarkers?.([]); this.markerPlugin?.detach?.(); } catch {}
    this.markerPlugin = null;
    for (const node of this.labelNodes.values()) node.remove();
    this.labelNodes.clear(); this.lastLabels = [];
    this.lastFrame = undefined;
    this.committedObjects = [];
    this.tableLayer?.replaceChildren();
    this.clearCanvas();
  }

  applyFrame(frame: CoreSpiritOutputFrame): void {
    const previousFrame = this.lastFrame;
    this.lastFrame = frame;
    const seenPlots = new Set<string>();
    for (const [id, points] of frame.plots) {
      seenPlots.add(id);
      let series = this.plotSeries.get(id);
      const style = frame.plotStyles.get(id) || {};
      if (!series) {
        series = this.chart.addSeries(LineSeries, {
          lineWidth: Math.max(1, Math.min(5, Number(style.lineWidth || 2))) as any,
          lineStyle: Number(style.lineStyle || 0) as any,
          color: style.color || '#38bdf8',
          priceLineVisible: style.priceLineVisible ?? false,
          lastValueVisible: style.lastValueVisible ?? true,
          title: style.title || id.split(':plot:').pop() || 'CoreSpirit',
        });
        this.plotSeries.set(id, series);
      } else {
        try { (series as any).applyOptions({ color: style.color || '#38bdf8', lineWidth: Number(style.lineWidth || 2), lineStyle: Number(style.lineStyle || 0), priceLineVisible: style.priceLineVisible ?? false, lastValueVisible: style.lastValueVisible ?? true, title: style.title || undefined }); } catch {}
      }
      this.applyPlotPoints(series, points);

    }
    for (const [id, series] of this.plotSeries) if (!seenPlots.has(id)) { this.remove(series); this.plotSeries.delete(id); }

    const markers = frame.signals.filter((x: any) => Number.isFinite(x.time)).map((x: any) => ({
      time: x.time as Time,
      position: x.metadata?.position === 'below' ? 'belowBar' as const : 'aboveBar' as const,
      color: x.metadata?.color || '#f59e0b',
      shape: x.metadata?.shape === 'arrowUp' ? 'arrowUp' as const : 'arrowDown' as const,
      text: String(x.type || 'SIGNAL')
    }));
    try {
      if (!this.markerPlugin && this.candle) this.markerPlugin = createSeriesMarkers(this.candle, []);
      this.markerPlugin?.setMarkers?.(markers as any);
    } catch (error) { console.warn('[CoreSpirit] marker render skipped', error); }

    const seenLines = new Set<string>();
    for (const drawing of frame.drawings as any[]) {
      if (drawing.kind !== 'line') continue;
      const id = drawing.id || `${drawing.kind}:${JSON.stringify(drawing)}`;
      seenLines.add(id);
      let series = this.lineSeries.get(id);
      if (!series) {
        series = this.chart.addSeries(LineSeries, {
          lineWidth: Math.max(1, Math.min(6, Number(drawing.style?.lineWidth || 1))) as any,
          priceLineVisible: false,
          lastValueVisible: false,
          color: drawing.style?.color || '#f59e0b',
          lineStyle: Number(drawing.style?.lineStyle || 0) as any,
        });
        this.lineSeries.set(id, series);
      }
      const nextLine = [{ time: drawing.start.time as Time, value: drawing.start.price }, { time: drawing.end.time as Time, value: drawing.end.price }] as any[];
      const previousDrawing = (previousFrame?.drawings as any[] | undefined)?.find((candidate) => candidate.id === id);
      const previousLine = previousDrawing ? [{ time: previousDrawing.start.time as Time, value: previousDrawing.start.price }, { time: previousDrawing.end.time as Time, value: previousDrawing.end.price }] : [];
      this.patchSeriesValues(series, previousLine, nextLine);

    }
    for (const [id, series] of this.lineSeries) if (!seenLines.has(id)) { this.remove(series); this.lineSeries.delete(id); }

    this.lastLabels = frame.labels || [];
    this.renderLabels();
    this.renderTables(frame.tables || []);
    this.refreshOverlay();
  }

  /**
   * Keep the realtime chart path incremental. Initial history is materialized once;
   * subsequent frames append/replace only the changed tail. Full replacement remains
   * the correctness fallback for genuine historical rewrites.
   */
  private applyPlotPoints(series: ISeriesApi<'Line'>, points: readonly { time: number; value: number | null }[]): void {
    if (!points.length) return;
    const valid = (point: { time: number; value: number | null }): boolean =>
      Number.isFinite(point.time) && (point.value == null || Number.isFinite(point.value));

    const current = series instanceof VelaNativeSeriesKernel ? series.snapshotPoints() : [];
    if (!current.length) {
      const initial = points.filter(valid).map((p) =>
        p.value == null
          ? ({ time: p.time as Time } as any)
          : ({ time: p.time as Time, value: p.value } as any),
      );
      if (initial.length) series.setData(initial as any);
      return;
    }

    const last = points[points.length - 1]!;
    const currentLast = current[current.length - 1]!;
    if (!valid(last)) return;

    if (points.length === current.length && last.time === currentLast.time) {
      series.update(last.value == null ? ({ time: last.time as Time } as any) : ({ time: last.time as Time, value: last.value } as any));
      return;
    }

    if (points.length > current.length && points[current.length - 1]?.time === currentLast.time) {
      for (let i = current.length; i < points.length; i += 1) {
        const point = points[i]!;
        if (!valid(point)) continue;
        series.update(point.value == null ? ({ time: point.time as Time } as any) : ({ time: point.time as Time, value: point.value } as any));
      }
      return;
    }

    const replacement = points.filter(valid).map((p) =>
      p.value == null
        ? ({ time: p.time as Time } as any)
        : ({ time: p.time as Time, value: p.value } as any),
    );
    series.setData(replacement as any);
  }

  /**
   * Commit a complete CoreSpirit result on the next render frame. Compute never
   * happens here: this is a latest-wins presentation queue only. The old scene
   * remains visible until the new, already-validated snapshot is applied atomically.
   */
  scheduleObjects(
    objects: readonly CoreSpiritObject[],
    revision: CoreSpiritVelaOutputRevision,
  ): Promise<boolean> {
    if (this.disposed || !this.outputRevisionGate.accept(revision)) return Promise.resolve(false);
    return new Promise<boolean>((resolve, reject) => {
      if (this.pendingScheduledObjects) this.pendingScheduledObjects.resolve(false);
      this.pendingScheduledObjects = { objects: [...objects], revision, resolve, reject };
      if (this.cancelScheduledFrame) return;

      this.cancelScheduledFrame = scheduleNextFrame(() => {
        this.cancelScheduledFrame = undefined;
        const pending = this.pendingScheduledObjects;
        this.pendingScheduledObjects = undefined;
        if (!pending) return;
        if (this.disposed || !this.outputRevisionGate.isCurrent(pending.revision)) {
          pending.resolve(false);
          return;
        }
        const previousObjects = [...this.committedObjects];
        try {
          // No browser paint can interleave this synchronous frame commit. If a
          // Vela operation fails unexpectedly, restore the prior committed snapshot.
          this.reset();
          this.applyObjects([...pending.objects]);
          pending.resolve(true);
        } catch (error) {
          try {
            this.reset();
            if (previousObjects.length && !this.disposed) this.applyObjects(previousObjects);
          } catch (restoreError) {
            pending.reject(new AggregateError([error, restoreError], 'Vela output commit and rollback both failed'));
            return;
          }
          pending.reject(error);
        }
      });
    });
  }

  applyObjects(objects: CoreSpiritObject[]): void {
    const frame: CoreSpiritOutputFrame = { plots: new Map(), plotStyles: new Map(), drawingCount: 0, signals: [], drawings: [], visuals: [], labels: [], tables: [] };
    const groups = new Map<string, Array<{ time: number; value: number | null }>>();
    for (const o of objects) {
      if (o.kind === 'series') { const id = o.seriesId || o.name || 'coreSpirit:plot:0'; const arr = groups.get(id) || []; arr.push({ time: o.time, value: o.value }); groups.set(id, arr); if (o.style) frame.plotStyles.set(id, o.style); }
      else if (o.kind === 'signal') frame.signals.push(o);
      else if (o.kind === 'label') frame.labels.push(o);
      else if (o.kind === 'line' || o.kind === 'zone' || o.kind === 'polyline' || o.kind === 'hline') frame.drawings.push(o);
      else if (o.kind === 'table') frame.tables.push(o);
      else if (o.kind === 'footprint') frame.visuals.push(o);
      else if (o.kind === 'box' || o.kind === 'band' || o.kind === 'arrow' || o.kind === 'shape' || o.kind === 'background' || o.kind === 'barcolor') frame.visuals.push(o);
    }
    frame.plots = groups;
    this.applyFrame(frame);
    this.committedObjects = Object.freeze([...objects]);
  }

  dispose(): void { this.disposed = true; this.cancelScheduledFrame?.(); this.cancelScheduledFrame = undefined; this.pendingScheduledObjects?.resolve(false); this.pendingScheduledObjects = undefined; this.outputRevisionGate.clear(); this.reset(); this.labelLayer?.remove(); this.labelLayer = undefined; this.tableLayer?.remove(); this.tableLayer = undefined; this.visualCanvas?.remove(); this.visualCanvas = undefined; this.visualContext = undefined; }

  private ensureVisualLayers() {
    if (this.disposed || !this.host) return;
    if (getComputedStyle(this.host).position === 'static') this.host.style.position = 'relative';
    if (!this.visualCanvas || !this.visualCanvas.isConnected) {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute'; canvas.style.inset = '0'; canvas.style.width = '100%'; canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none'; canvas.style.zIndex = '15';
      this.host.appendChild(canvas); this.visualCanvas = canvas; this.visualContext = canvas.getContext('2d') || undefined;
    }
    if (!this.labelLayer || !this.labelLayer.isConnected) {
      const layer = document.createElement('div');
      layer.style.position = 'absolute'; layer.style.inset = '0'; layer.style.pointerEvents = 'none'; layer.style.overflow = 'hidden'; layer.style.zIndex = '20';
      this.host.appendChild(layer); this.labelLayer = layer;
    }
    if (!this.tableLayer || !this.tableLayer.isConnected) {
      const table = document.createElement('div');
      table.style.position = 'absolute'; table.style.inset = '0'; table.style.pointerEvents = 'none'; table.style.zIndex = '25';
      this.host.appendChild(table); this.tableLayer = table;
    }
    this.resizeCanvas();
  }

  private resizeCanvas() {
    if (!this.visualCanvas || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.floor(rect.width)); const height = Math.max(1, Math.floor(rect.height));
    if (this.visualCanvas.width !== width * dpr || this.visualCanvas.height !== height * dpr) {
      this.visualCanvas.width = width * dpr; this.visualCanvas.height = height * dpr;
      this.visualContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  private refreshOverlay() { if (this.disposed) return; this.ensureVisualLayers(); this.resizeCanvas(); this.renderRichVisuals(); this.positionLabels(); }

  private clearCanvas() {
    if (!this.visualCanvas || !this.visualContext) return;
    this.visualContext.clearRect(0, 0, this.visualCanvas.clientWidth || this.visualCanvas.width, this.visualCanvas.clientHeight || this.visualCanvas.height);
  }

  private coordinate(time: number, price: number): {x:number;y:number}|null {
    const x = (this.chart.timeScale() as any).timeToCoordinate?.(time as Time);
    const y = (this.candle as any)?.priceToCoordinate?.(price);
    if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
    return { x: Number(x), y: Number(y) };
  }

  private renderRichVisuals() {
    if (!this.visualContext || !this.visualCanvas || !this.lastFrame) return;
    const ctx = this.visualContext; const width = this.visualCanvas.clientWidth || this.visualCanvas.width; const height = this.visualCanvas.clientHeight || this.visualCanvas.height;
    ctx.clearRect(0, 0, width, height);
    const objects = [...(this.lastFrame.drawings || []), ...(this.lastFrame.visuals || [])] as any[];
    for (const obj of objects) {
      if (obj.kind === 'zone' || obj.kind === 'box') this.drawBox(ctx, obj);
      else if (obj.kind === 'arrow') this.drawArrow(ctx, obj);
      else if (obj.kind === 'shape') this.drawShape(ctx, obj);
      else if (obj.kind === 'polyline') this.drawPolyline(ctx, obj);
      else if (obj.kind === 'hline') this.drawHLine(ctx, obj);
      else if (obj.kind === 'background' || obj.kind === 'barcolor') this.drawBarTint(ctx, obj);
      else if (obj.kind === 'footprint') this.drawFootprint(ctx, obj);
    }
    this.drawBands(ctx, (this.lastFrame.visuals || []).filter((x:any)=>x.kind==='band') as any[]);
  }

  private drawBox(ctx: CanvasRenderingContext2D, obj:any) {
    const a=this.coordinate(obj.left,obj.top), b=this.coordinate(obj.right,obj.bottom); if(!a||!b)return;
    const st=(obj.style||{}) as CoreSpiritVisualStyle; const left=Math.min(a.x,b.x), top=Math.min(a.y,b.y), w=Math.abs(b.x-a.x), h=Math.abs(b.y-a.y);
    const fill=st.fillColor||st.color||'#2563eb', border=st.borderColor||st.color||'#2563eb', opacity=Number.isFinite(st.fillOpacity as number)?Number(st.fillOpacity):0.14;
    ctx.save(); ctx.globalAlpha=Math.max(0,Math.min(1,opacity)); ctx.fillStyle=fill; ctx.fillRect(left,top,w,h); ctx.globalAlpha=Number.isFinite(st.opacity as number)?Number(st.opacity):1; ctx.strokeStyle=border; ctx.lineWidth=st.borderWidth||1; ctx.strokeRect(left,top,w,h); this.pattern(ctx,left,top,w,h,st.pattern,st.color||border); ctx.restore();
  }

  private drawPolyline(ctx:CanvasRenderingContext2D,obj:any){const pts=(obj.points||[]).map((p:any)=>this.coordinate(p.time,p.price)).filter(Boolean) as Array<{x:number;y:number}>;if(pts.length<2)return;const st=obj.style||{};ctx.save();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=st.color||'#38bdf8';ctx.lineWidth=Math.max(1,Math.min(8,Number(st.lineWidth||2)));if(st.pattern==='dots')ctx.setLineDash([1,7]);else if(st.pattern==='stripes'||st.pattern==='hatch')ctx.setLineDash([8,6]);ctx.stroke();ctx.restore();}

  private drawHLine(ctx:CanvasRenderingContext2D,obj:any){const y=(this.candle as any)?.priceToCoordinate?.(obj.price);if(y==null||!Number.isFinite(Number(y)))return;const st=obj.style||{};ctx.save();ctx.beginPath();ctx.moveTo(0,Number(y));ctx.lineTo(this.visualCanvas?.clientWidth||0,Number(y));ctx.strokeStyle=st.color||'#64748b';ctx.lineWidth=Math.max(1,Math.min(6,Number(st.lineWidth||1)));ctx.setLineDash(st.lineStyle===1?[7,5]:st.lineStyle===2?[2,4]:[]);ctx.stroke();ctx.restore();}

  private drawBarTint(ctx:CanvasRenderingContext2D,obj:any){const x=(this.chart.timeScale() as any).timeToCoordinate?.(obj.time as Time);if(x==null||!Number.isFinite(Number(x)))return;const w=obj.kind==='barcolor'?8:14;const alpha=Math.max(0,Math.min(1,Number(obj.opacity??0.12)));ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=obj.color||'#2563eb';ctx.fillRect(Number(x)-w/2,0,w,this.visualCanvas?.clientHeight||0);ctx.restore();}

  private drawBands(ctx: CanvasRenderingContext2D, bands:any[]) {
    const grouped=new Map<string,any[]>(); for(const b of bands){const arr=grouped.get(b.id)||[];arr.push(b);grouped.set(b.id,arr);}
    for(const points of grouped.values()){
      points.sort((a,b)=>a.time-b.time); const sampled=this.sample(points,12000); const top=sampled.map(p=>this.coordinate(p.time,p.top)).filter(Boolean) as {x:number;y:number}[]; const bottom=sampled.map(p=>this.coordinate(p.time,p.bottom)).filter(Boolean) as {x:number;y:number}[];
      if(top.length<2||bottom.length<2)continue;
      const st=(sampled[0].style||{}) as CoreSpiritVisualStyle;
      ctx.save(); ctx.globalAlpha=Number.isFinite(st.fillOpacity as number)?Number(st.fillOpacity):0.16;
      if(st.fillColor2&&st.fillColor){const ys=top.concat(bottom).map(x=>x.y);const g=ctx.createLinearGradient(0,Math.min(...ys),0,Math.max(...ys));g.addColorStop(0,st.fillColor);g.addColorStop(1,st.fillColor2);ctx.fillStyle=g;}else ctx.fillStyle=st.fillColor||st.color||'#2563eb';
      ctx.beginPath(); top.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y)); for(let i=bottom.length-1;i>=0;i--)ctx.lineTo(bottom[i].x,bottom[i].y);ctx.closePath();ctx.fill();
      ctx.globalAlpha=Number.isFinite(st.opacity as number)?Number(st.opacity):1; ctx.strokeStyle=st.color||st.fillColor||'#2563eb'; ctx.lineWidth=st.lineWidth||1; ctx.beginPath(); top.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.stroke();ctx.beginPath();bottom.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.stroke();
      ctx.restore();
    }
  }


  private drawFootprint(ctx: CanvasRenderingContext2D, obj: any) {
    const rows = Array.isArray(obj.rows) ? obj.rows : [];
    if (!rows.length) return;
    const x = (this.chart.timeScale() as any).timeToCoordinate?.(obj.time as Time);
    if (x == null || !Number.isFinite(Number(x))) return;
    const tick = Math.max(0.0000001, Number(obj.tickSize || 1));
    const halfWidth = 18;
    const max = Math.max(1, ...rows.map((r:any) => Number(r.intensity || 0)));
    ctx.save();
    for (const row of rows) {
      const y = (this.candle as any)?.priceToCoordinate?.(Number(row.price));
      const y2 = (this.candle as any)?.priceToCoordinate?.(Number(row.price) + tick);
      if (y == null) continue;
      const h = Math.max(2, Math.abs(Number(y2 ?? y - 4) - Number(y)));
      const intensity = Math.max(0, Math.min(1, Number(row.intensity || 0) / max));
      const delta = Number(row.delta || 0);
      const base = delta >= 0 ? '34,197,94' : '239,68,68';
      const alpha = 0.08 + intensity * 0.58;
      ctx.fillStyle = `rgba(${base},${alpha})`;
      const width = Math.max(4, halfWidth * (0.25 + intensity * 0.75));
      ctx.fillRect(Number(x) - width / 2, Number(y) - h / 2, width, h);
      if (Math.abs(delta) > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(delta)), Number(x) + width / 2 + 2, Number(y));
      }
    }
    ctx.restore();
  }

  private drawArrow(ctx:CanvasRenderingContext2D,obj:any){const a=this.coordinate(obj.start.time,obj.start.price),b=this.coordinate(obj.end.time,obj.end.price);if(!a||!b)return;const st=obj.style||{};const color=st.color||'#f59e0b';const width=st.lineWidth||2;const head=Math.max(6,width*3.5);const angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-head*Math.cos(angle-Math.PI/6),b.y-head*Math.sin(angle-Math.PI/6));ctx.lineTo(b.x-head*Math.cos(angle+Math.PI/6),b.y-head*Math.sin(angle+Math.PI/6));ctx.closePath();ctx.fill();ctx.restore();}

  private drawShape(ctx:CanvasRenderingContext2D,obj:any){const pt=this.coordinate(obj.time,obj.price);if(!pt)return;const st=obj.style||{};const size=Math.max(4,Number(st.size||10));const color=st.color||st.fillColor||'#f59e0b';ctx.save();ctx.fillStyle=st.fillColor||color;ctx.strokeStyle=st.color||color;ctx.lineWidth=st.lineWidth||1.5;ctx.translate(pt.x,pt.y);ctx.beginPath();switch(obj.shape){case'arrowUp':ctx.moveTo(0,-size);ctx.lineTo(size*.75,size*.65);ctx.lineTo(size*.25,size*.45);ctx.lineTo(size*.25,size);ctx.lineTo(-size*.25,size);ctx.lineTo(-size*.25,size*.45);ctx.lineTo(-size*.75,size*.65);break;case'arrowDown':ctx.moveTo(0,size);ctx.lineTo(size*.75,-size*.65);ctx.lineTo(size*.25,-size*.45);ctx.lineTo(size*.25,-size);ctx.lineTo(-size*.25,-size);ctx.lineTo(-size*.25,-size*.45);ctx.lineTo(-size*.75,-size*.65);break;case'diamond':ctx.moveTo(0,-size);ctx.lineTo(size,0);ctx.lineTo(0,size);ctx.lineTo(-size,0);break;case'triangleUp':ctx.moveTo(0,-size);ctx.lineTo(size,size);ctx.lineTo(-size,size);break;case'triangleDown':ctx.moveTo(0,size);ctx.lineTo(size,-size);ctx.lineTo(-size,-size);break;case'square':ctx.rect(-size,-size,size*2,size*2);break;case'cross':ctx.moveTo(-size,0);ctx.lineTo(size,0);ctx.moveTo(0,-size);ctx.lineTo(0,size);break;case'star':for(let i=0;i<10;i++){const r=i%2?size*.42:size;const a=-Math.PI/2+i*Math.PI/5;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}break;default:ctx.arc(0,0,size,0,Math.PI*2);break;}ctx.fill();ctx.stroke();if(st.text){ctx.fillStyle=st.textColor||'#fff';ctx.font=`600 ${Math.max(9,size)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(st.text),0,-size*1.6);}ctx.restore();}

  private pattern(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,pattern?:string,color?:string){if(!pattern||pattern==='solid')return;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.strokeStyle=color||'#fff';ctx.globalAlpha=.18;ctx.lineWidth=1;const step=8;if(pattern==='dots'){for(let yy=y;yy<y+h;yy+=step)for(let xx=x;xx<x+w;xx+=step){ctx.beginPath();ctx.arc(xx,yy,1,0,Math.PI*2);ctx.fillStyle=color||'#fff';ctx.fill();}}else{for(let i=-h;i<w+h;i+=step){ctx.beginPath();if(pattern==='stripes'){ctx.moveTo(x+i,y);ctx.lineTo(x+i-h,y+h);}else{ctx.moveTo(x+i,y+h);ctx.lineTo(x+i+h,y);}ctx.stroke();}}ctx.restore();}

  private sample<T>(arr:T[],max:number):T[]{if(arr.length<=max)return arr;const step=Math.ceil(arr.length/max),out:T[]=[];for(let i=0;i<arr.length;i+=step)out.push(arr[i]);if(out[out.length-1]!==arr[arr.length-1])out.push(arr[arr.length-1]);return out;}

  private renderLabels() {
    if (!this.labelLayer) return;
    const seen = new Set<string>();
    for (const label of this.lastLabels) {
      seen.add(label.id); let node = this.labelNodes.get(label.id);
      if (!node) { node = document.createElement('div'); this.labelNodes.set(label.id,node); this.labelLayer.appendChild(node); }
      node.textContent = label.text; const st = label.style || {};
      node.style.position='absolute'; node.style.whiteSpace='nowrap'; node.style.pointerEvents='none'; node.style.boxSizing='border-box';
      node.style.background=st.background || '#2563eb'; node.style.color=st.color || '#fff'; node.style.border=st.border || '1px solid rgba(255,255,255,.18)'; node.style.borderRadius=`${st.borderRadius ?? (st.shape==='circle'?999:5)}px`;
      node.style.fontSize=`${st.fontSize ?? 12}px`; node.style.fontWeight=st.fontWeight || '600'; node.style.fontStyle=st.fontStyle || 'normal'; node.style.textAlign=st.textAlign || 'center'; node.style.padding=st.padding || '3px 7px'; node.style.opacity=String(st.opacity ?? 1); node.style.transform='translate(-50%, -50%)';
    }
    for (const [id,node] of this.labelNodes) if (!seen.has(id)) { node.remove(); this.labelNodes.delete(id); }
    this.positionLabels();
  }

  private renderTables(tables: Extract<CoreSpiritObject,{kind:'table'}>[]){if(!this.tableLayer)return;this.tableLayer.replaceChildren();const groups=new Map<string,typeof tables>();for(const t of tables){const arr=groups.get(t.position)||[];arr.push(t);groups.set(t.position,arr);}const anchor=(position:string)=>{const el=document.createElement('div');el.style.position='absolute';el.style.display='grid';el.style.gap='2px';el.style.pointerEvents='none';if(position.includes('top'))el.style.top='8px';else if(position.includes('bottom'))el.style.bottom='8px';else el.style.top='50%';if(position.includes('Left'))el.style.left='8px';else if(position.includes('Right'))el.style.right='8px';else{el.style.left='50%';el.style.transform='translateX(-50%)';}if(position.includes('middle'))el.style.transform=position.includes('Center')?'translate(-50%,-50%)':'translateY(-50%)';return el;};for(const [position,cells] of groups){const wrap=anchor(position);const maxCol=Math.max(...cells.map(x=>x.column),0);wrap.style.gridTemplateColumns=`repeat(${maxCol+1},auto)`;for(const cell of cells){const el=document.createElement('div');const st=cell.style||{};el.textContent=cell.text;el.style.background=st.background||'rgba(15,23,42,.88)';el.style.color=st.color||'#fff';el.style.fontSize=`${st.fontSize??12}px`;el.style.fontWeight=st.fontWeight||'500';el.style.border=st.border||'1px solid rgba(255,255,255,.12)';el.style.padding=st.padding||'4px 7px';el.style.opacity=String(st.opacity??1);el.style.textAlign=st.align||'left';el.style.whiteSpace='nowrap';el.style.gridRow=String(cell.row+1);el.style.gridColumn=String(cell.column+1);wrap.appendChild(el);}this.tableLayer.appendChild(wrap);}}

  private positionLabels() {
    if (!this.labelLayer) return; const ts:any=this.chart.timeScale(); const series:any=this.candle||this.plotSeries.values().next().value; if(!series)return;
    for(const label of this.lastLabels){const node=this.labelNodes.get(label.id);if(!node)continue;const x=ts.timeToCoordinate(label.time as Time),y=series.priceToCoordinate(label.price);if(x==null||y==null||!Number.isFinite(Number(x))||!Number.isFinite(Number(y))){node.style.display='none';continue;}node.style.display='block';const offset=label.position==='above'?-18:label.position==='below'?18:0;node.style.left=`${Number(x)}px`;node.style.top=`${Number(y)+offset}px`;}
  }
  private patchSeriesValues(
    series: ISeriesApi<'Line'>,
    previous: readonly { time:number; value?:number|null }[],
    current: readonly { time:number; value?:number|null }[],
  ): void {
    const patchable = series as ISeriesApi<'Line'> & {
      patch?: (patch: {
        type:'append'|'replaceLast'|'replaceRange'|'removeRange';
        from?:number;
        to?:number;
        values?: readonly { time:number; value?:number|null }[];
      }) => void;
    };
    if (!previous.length) {
      series.setData(current as any);
      return;
    }
    if (previous.length === current.length && previous.every((point,index) => point.time === current[index]?.time && point.value === current[index]?.value)) return;

    let prefix = 0;
    while (prefix < previous.length && prefix < current.length &&
      previous[prefix]?.time === current[prefix]?.time && previous[prefix]?.value === current[prefix]?.value) prefix += 1;

    let suffix = 0;
    while (
      suffix < previous.length - prefix &&
      suffix < current.length - prefix &&
      previous[previous.length - 1 - suffix]?.time === current[current.length - 1 - suffix]?.time &&
      previous[previous.length - 1 - suffix]?.value === current[current.length - 1 - suffix]?.value
    ) suffix += 1;

    const previousEnd = previous.length - suffix - 1;
    const currentEnd = current.length - suffix - 1;

    // The dominant live-chart case is a forming-bar mutation: same cardinality,
    // same historical prefix, only the last point changed. Keep this on the
    // O(1) replace-last path instead of sending a range patch or rebuilding the series.
    if (previous.length === current.length && current.length > 0 && prefix === current.length - 1 && suffix === 0) {
      patchable.patch?.({type:'replaceLast', values:current.slice(-1)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }
    if (prefix === previous.length && current.length > previous.length) {
      patchable.patch?.({type:'append', values:current.slice(previous.length)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }
    if (prefix === current.length && previous.length > current.length) {
      patchable.patch?.({type:'removeRange', from:prefix, to:previous.length - 1});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (prefix === current.length - suffix && previousEnd === prefix - 1) {
      patchable.patch?.({type:'append', values:current.slice(prefix, currentEnd + 1)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (prefix === previous.length - suffix && currentEnd === prefix - 1) {
      patchable.patch?.({type:'removeRange', from:prefix, to:previousEnd});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (previousEnd >= prefix) {
      patchable.patch?.({
        type:'replaceRange',
        from:prefix,
        to:previousEnd,
        values:current.slice(prefix, currentEnd + 1),
      });
    } else {
      patchable.patch?.({
        type:'append',
        values:current.slice(prefix, currentEnd + 1),
      });
    }
    if (!patchable.patch) series.setData(current as any);
  }

  private remove(series:any){try{this.chart.removeSeries(series);}catch{}}
}
