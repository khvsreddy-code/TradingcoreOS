export type RollingWindowSnapshot = { count: number; value: number | null };

type MonotonicEntry = { index: number; value: number };

class MonotonicDeque {
  private data: MonotonicEntry[] = [];
  private head = 0;
  constructor(private readonly direction: 'min' | 'max') {}
  private better(a: number, b: number) { return this.direction === 'min' ? a <= b : a >= b; }
  push(entry: MonotonicEntry) {
    while (this.data.length > this.head) {
      const tail = this.data[this.data.length - 1];
      if (this.better(tail.value, entry.value)) break;
      this.data.pop();
    }
    this.data.push(entry);
  }
  removeBackIndex(index: number) {
    const last = this.data[this.data.length - 1];
    if (last?.index === index) this.data.pop();
  }
  evictBefore(startIndex: number) {
    while (this.head < this.data.length && this.data[this.head].index < startIndex) this.head += 1;
    if (this.head > 32 && this.head * 2 > this.data.length) { this.data = this.data.slice(this.head); this.head = 0; }
  }
  peek() { return this.head < this.data.length ? this.data[this.head] : undefined; }
  clear() { this.data = []; this.head = 0; }
}

abstract class RollingBase {
  protected readonly capacity: number;
  protected readonly buffer: number[];
  protected readonly versions: number[];
  protected cursor = 0;
  protected count = 0;
  protected absoluteIndex = 0;
  protected latestValue: number | null = null;
  constructor(period: number) {
    this.capacity = Math.max(1, Math.floor(period));
    this.buffer = new Array(this.capacity).fill(0);
    this.versions = new Array(this.capacity).fill(0);
  }
  protected slotForCurrent() { return (this.cursor - 1 + this.capacity) % this.capacity; }
  protected appendSlot(value: number) {
    const slot = this.cursor;
    this.buffer[slot] = value;
    this.versions[slot] += 1;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.absoluteIndex += 1;
    this.latestValue = value;
    return { slot, index: this.absoluteIndex - 1, version: this.versions[slot] };
  }
  protected replaceCurrentSlot(value: number) {
    if (this.count === 0) return this.appendSlot(value);
    const slot = this.slotForCurrent();
    this.buffer[slot] = value;
    this.versions[slot] += 1;
    this.latestValue = value;
    return { slot, index: this.absoluteIndex - 1, version: this.versions[slot] };
  }
  reset() {
    this.cursor = 0; this.count = 0; this.absoluteIndex = 0; this.latestValue = null;
    this.versions.fill(0); this.buffer.fill(0);
  }
  get size() { return this.count; }
  get latest() { return this.latestValue; }
}

export class RollingMean extends RollingBase {
  private sum = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (!Number.isFinite(v)) return { count: this.count, value: this.value() };
    if (mode === 'replace' && this.count) {
      const old = this.buffer[this.slotForCurrent()]; this.sum += v - old; this.replaceCurrentSlot(v);
    } else {
      if (this.count === this.capacity) this.sum -= this.buffer[this.cursor]; this.appendSlot(v); this.sum += v;
    }
    return { count: this.count, value: this.value() };
  }
  value() { return this.count === this.capacity ? this.sum / this.capacity : null; }
  reset() { super.reset(); this.sum = 0; }
  get sumValue() { return this.sum; }
}

export class RollingVariance extends RollingBase {
  private sum = 0;
  private sumSquares = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (!Number.isFinite(v)) return { count: this.count, value: this.value() };
    if (mode === 'replace' && this.count) {
      const old = this.buffer[this.slotForCurrent()]; this.sum += v - old; this.sumSquares += v * v - old * old; this.replaceCurrentSlot(v);
    } else {
      if (this.count === this.capacity) { const old = this.buffer[this.cursor]; this.sum -= old; this.sumSquares -= old * old; }
      this.appendSlot(v); this.sum += v; this.sumSquares += v * v;
    }
    return { count: this.count, value: this.value() };
  }
  mean() { return this.count === this.capacity ? this.sum / this.capacity : null; }
  variance() { return this.count === this.capacity ? Math.max(0, this.sumSquares / this.capacity - (this.sum / this.capacity) ** 2) : null; }
  value() { const v = this.variance(); return v == null ? null : Math.sqrt(v); }
  get sumValue() { return this.sum; }
  reset() { super.reset(); this.sum = 0; this.sumSquares = 0; }
  get countValue() { return this.count; }
}

type OrderedNode = { key:number; priority:number; count:number; size:number; sum:number; left:OrderedNode|null; right:OrderedNode|null; };

class OrderedMultiset {
  private root:OrderedNode|null=null;
  private seed=0x9e3779b9;
  private nextPriority(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return this.seed>>>0;}
  private size(n:OrderedNode|null){return n?.size||0;}
  private sum(n:OrderedNode|null){return n?.sum||0;}
  private pull(n:OrderedNode){n.size=n.count+this.size(n.left)+this.size(n.right);n.sum=n.key*n.count+this.sum(n.left)+this.sum(n.right);return n;}
  private rotateRight(y:OrderedNode){const x=y.left!;y.left=x.right;x.right=y;this.pull(y);return this.pull(x);}
  private rotateLeft(x:OrderedNode){const y=x.right!;x.right=y.left;y.left=x;this.pull(x);return this.pull(y);}
  private insertNode(n:OrderedNode|null,key:number):OrderedNode{if(!n)return this.pull({key,priority:this.nextPriority(),count:1,size:1,sum:key,left:null,right:null});if(key===n.key){n.count+=1;return this.pull(n);}if(key<n.key){n.left=this.insertNode(n.left,key);if(n.left!.priority>n.priority)n=this.rotateRight(n);}else{n.right=this.insertNode(n.right,key);if(n.right!.priority>n.priority)n=this.rotateLeft(n);}return this.pull(n);}
  private eraseNode(n:OrderedNode|null,key:number):OrderedNode|null{if(!n)return null;if(key===n.key){if(n.count>1){n.count-=1;return this.pull(n);}if(!n.left)return n.right;if(!n.right)return n.left;if(n.left.priority>n.right.priority){n=this.rotateRight(n);n.right=this.eraseNode(n.right,key);}else{n=this.rotateLeft(n);n.left=this.eraseNode(n.left,key);}return this.pull(n);}if(key<n.key)n.left=this.eraseNode(n.left,key);else n.right=this.eraseNode(n.right,key);return this.pull(n);}
  insert(key:number){this.root=this.insertNode(this.root,key);}
  erase(key:number){this.root=this.eraseNode(this.root,key);}
  countLE(key:number){let n=this.root,total=0;while(n){if(key<n.key)n=n.left;else{total+=this.size(n.left)+n.count;n=n.right;}}return total;}
  sumLE(key:number){let n=this.root,total=0;while(n){if(key<n.key)n=n.left;else{total+=this.sum(n.left)+n.key*n.count;n=n.right;}}return total;}
  clear(){this.root=null;this.seed=0x9e3779b9;}
}

/** Exact rolling mean absolute deviation in expected O(log period) per append/replace. */
export class RollingAbsoluteDeviation extends RollingBase {
  private readonly ordered=new OrderedMultiset();
  private sum=0;
  update(value:number,mode:'append'|'replace'='append'){const v=Number(value);if(!Number.isFinite(v))return this.value(null);if(mode==='replace'&&this.count){const old=this.buffer[this.slotForCurrent()];this.ordered.erase(old);this.sum-=old;this.replaceCurrentSlot(v);}else{if(this.count===this.capacity){const old=this.buffer[this.cursor];this.ordered.erase(old);this.sum-=old;}this.appendSlot(v);}this.ordered.insert(v);this.sum+=v;return this.value(null);}
  value(mean:number|null){if(mean==null||this.count!==this.capacity)return null;const leftCount=this.ordered.countLE(mean),leftSum=this.ordered.sumLE(mean),rightCount=this.capacity-leftCount,rightSum=this.sum-leftSum;return (mean*leftCount-leftSum+rightSum-mean*rightCount)/this.capacity;}
  reset(){super.reset();this.ordered.clear();this.sum=0;}
}

export class RollingMinMax extends RollingBase {
  private readonly minDeque = new MonotonicDeque('min');
  private readonly maxDeque = new MonotonicDeque('max');
  private refreshWindow() {
    const start = Math.max(0, this.absoluteIndex - this.count);
    this.minDeque.evictBefore(start);
    this.maxDeque.evictBefore(start);
  }
  update(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value);
    if (!Number.isFinite(v)) return { count: this.count, min: this.min(), max: this.max() };
    if (mode === 'replace' && this.count) {
      const entry = this.replaceCurrentSlot(v);
      this.minDeque.removeBackIndex(entry.index);
      this.maxDeque.removeBackIndex(entry.index);
      this.minDeque.push({ index: entry.index, value: v });
      this.maxDeque.push({ index: entry.index, value: v });
    } else {
      const entry = this.appendSlot(v);
      this.minDeque.push({ index: entry.index, value: v });
      this.maxDeque.push({ index: entry.index, value: v });
    }
    this.refreshWindow();
    return { count: this.count, min: this.min(), max: this.max() };
  }
  min() { const x = this.minDeque.peek(); return this.count === this.capacity && x ? x.value : null; }
  max() { const x = this.maxDeque.peek(); return this.count === this.capacity && x ? x.value : null; }
  reset() { super.reset(); this.minDeque.clear(); this.maxDeque.clear(); }
}

export class RollingSum extends RollingBase {
  private sum = 0;
  update(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value);
    if (!Number.isFinite(v)) return this.sumValue();
    if (mode === 'replace' && this.count) { const old = this.buffer[this.slotForCurrent()]; this.sum += v - old; this.replaceCurrentSlot(v); }
    else { if (this.count === this.capacity) this.sum -= this.buffer[this.cursor]; this.appendSlot(v); this.sum += v; }
    return this.sumValue();
  }
  sumValue() { return this.sum; }
  reset() { super.reset(); this.sum = 0; }
}

export class EMAState {
  protected readonly period: number;
  protected readonly seed: RollingMean;
  protected valueState: number | null = null;
  protected previousOutput: number | null = null;
  protected currentInput: number | null = null;
  constructor(period: number) { this.period = Math.max(1, Math.floor(period)); this.seed = new RollingMean(this.period); }
  update(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value); if (!Number.isFinite(v)) return this.valueState;
    if (mode === 'replace' && this.currentInput != null) {
      this.seed.update(v, 'replace'); this.currentInput = v;
      if (this.seed.size < this.period) { this.valueState = null; this.previousOutput = null; }
      else if (this.valueState == null) { this.valueState = this.seed.value(); this.previousOutput = null; }
      else { const alpha = 2 / (this.period + 1); this.valueState = alpha * v + (1 - alpha) * (this.previousOutput ?? this.valueState); }
      return this.valueState;
    }
    this.seed.update(v, 'append'); this.currentInput = v;
    if (this.seed.size < this.period) { this.valueState = null; return null; }
    if (this.valueState == null) { this.valueState = this.seed.value(); this.previousOutput = null; return this.valueState; }
    this.previousOutput = this.valueState; const alpha = 2 / (this.period + 1); this.valueState = alpha * v + (1 - alpha) * this.valueState; return this.valueState;
  }
  reset() { this.seed.reset(); this.valueState = null; this.previousOutput = null; this.currentInput = null; }
  get value() { return this.valueState; }
}

export class WilderState {
  readonly period: number;
  private readonly seed: RollingMean;
  private valueState: number | null = null;
  private previousOutput: number | null = null;
  private currentInput: number | null = null;
  constructor(period: number) { this.period = Math.max(1, Math.floor(period)); this.seed = new RollingMean(this.period); }
  updateWilder(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value); if (!Number.isFinite(v)) return this.valueState;
    if (mode === 'replace' && this.currentInput != null) {
      this.seed.update(v, 'replace'); this.currentInput = v;
      if (this.seed.size < this.period) { this.valueState = null; this.previousOutput = null; }
      else if (this.valueState == null) { this.valueState = this.seed.value(); this.previousOutput = null; }
      else { this.valueState = ((this.period - 1) * (this.previousOutput ?? this.valueState) + v) / this.period; }
      return this.valueState;
    }
    this.seed.update(v, 'append'); this.currentInput = v;
    if (this.seed.size < this.period) { this.valueState = null; return null; }
    if (this.valueState == null) { this.valueState = this.seed.value(); this.previousOutput = null; return this.valueState; }
    this.previousOutput = this.valueState; this.valueState = ((this.period - 1) * this.valueState + v) / this.period; return this.valueState;
  }
  reset() { this.seed.reset(); this.valueState = null; this.previousOutput = null; this.currentInput = null; }
  get value() { return this.valueState; }
}

export class ATRState {
  private readonly wilder: WilderState;
  private previousClose: number | null = null;
  private latestTR: number | null = null;
  constructor(period: number) { this.wilder = new WilderState(period); }
  update(high: number, low: number, close: number, mode: 'append' | 'replace' = 'append') {
    const h = Number(high), l = Number(low), c = Number(close); if (![h,l,c].every(Number.isFinite)) return null;
    const tr = this.previousClose == null ? h - l : Math.max(h - l, Math.abs(h - this.previousClose), Math.abs(l - this.previousClose));
    const result = this.wilder.updateWilder(tr, mode); this.latestTR = tr;
    if (mode === 'append') this.previousClose = c;
    return result;
  }
  replacePreviousClose(close: number) { /* previous close is intentionally unchanged on same-bar replacement */ void close; }
  get trueRange() { return this.latestTR; }
  get value() { return this.wilder.value; }
  reset() { this.wilder.reset(); this.previousClose = null; this.latestTR = null; }
}

export class WMAState extends RollingBase {
  private weighted = 0;
  private sum = 0;
  private currentInput: number | null = null;
  update(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value); if (!Number.isFinite(v)) return null;
    const p = this.capacity;
    if (mode === 'replace' && this.count) {
      const old = this.buffer[this.slotForCurrent()];
      const weight = this.count < p ? this.count : p;
      this.currentInput = v;
      this.sum += v - old;
      this.weighted += (v - old) * weight;
      this.replaceCurrentSlot(v);
      return this.count === p ? this.weighted / (p * (p + 1) / 2) : null;
    }
    if (this.count === p) {
      const oldSum = this.sum;
      const oldest = this.buffer[this.cursor];
      this.sum = oldSum - oldest + v;
      this.weighted = this.weighted - oldSum + v * p;
      this.appendSlot(v);
    } else {
      this.weighted += v * (this.count + 1);
      this.sum += v;
      this.appendSlot(v);
    }
    return this.count === p ? this.weighted / (p * (p + 1) / 2) : null;
  }
  reset() { super.reset(); this.weighted = 0; this.sum = 0; this.currentInput = null; }
}

export class VWAPSessionState {
  private sessions = new Map<string, { pv: number; volume: number }>();
  private lastKey: string | null = null;
  private lastPV = 0;
  private lastVolume = 0;
  private lastValue: number | null = null;
  private keyFor(timestamp: string | number) { return new Date(timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }); }
  update(timestamp: string | number, price: number, volume: number, fallback: number, mode: 'append' | 'replace' = 'append') {
    const key = this.keyFor(timestamp), p = Number(price), v = Math.max(0, Number(volume) || 0);
    if (!Number.isFinite(p)) return this.lastValue;
    if (mode === 'replace' && this.lastKey === key) {
      const session = this.sessions.get(key)!; session.pv -= this.lastPV; session.volume -= this.lastVolume;
    }
    const session = this.sessions.get(key) || { pv: 0, volume: 0 }; session.pv += p * v; session.volume += v; this.sessions.set(key, session);
    this.lastKey = key; this.lastPV = p * v; this.lastVolume = v; this.lastValue = session.volume ? session.pv / session.volume : fallback;
    return this.lastValue;
  }
  reset() { this.sessions.clear(); this.lastKey = null; this.lastPV = 0; this.lastVolume = 0; this.lastValue = null; }
}

export function sourceValue(candle: { open:number; high:number; low:number; close:number }, source: string = 'close'): number {
  switch (source) {
    case 'open': return candle.open; case 'high': return candle.high; case 'low': return candle.low; case 'hl2': return (candle.high + candle.low) / 2;
    case 'hlc3': return (candle.high + candle.low + candle.close) / 3; case 'ohlc4': return (candle.open + candle.high + candle.low + candle.close) / 4;
    case 'hlcc4': return (candle.high + candle.low + candle.close + candle.close) / 4; default: return candle.close;
  }
}
