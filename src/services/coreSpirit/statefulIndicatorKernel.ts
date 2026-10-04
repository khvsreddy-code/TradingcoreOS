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

/** Rolling minimum backed by the canonical forming-bar-safe extrema state. */
export class RollingMin {
  private readonly state: RollingMinMax;
  constructor(period: number) { this.state = new RollingMinMax(period); }
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const snapshot = this.state.update(value, mode);
    return { count: snapshot.count, value: snapshot.min };
  }
  value(): number | null { return this.state.min(); }
  get size(): number { return this.state.size; }
  reset(): void { this.state.reset(); }
}

/** Rolling maximum backed by the canonical forming-bar-safe extrema state. */
export class RollingMax {
  private readonly state: RollingMinMax;
  constructor(period: number) { this.state = new RollingMinMax(period); }
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const snapshot = this.state.update(value, mode);
    return { count: snapshot.count, value: snapshot.max };
  }
  value(): number | null { return this.state.max(); }
  get size(): number { return this.state.size; }
  reset(): void { this.state.reset(); }
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
  copyFrom(source: RollingMean): void {
    if (source.capacity !== this.capacity) throw new Error('incompatible rolling mean state');
    this.buffer.set(source.buffer); this.versions.set(source.versions);
    this.cursor = source.cursor; this.count = source.count; this.absoluteIndex = source.absoluteIndex; this.latestValue = source.latestValue;
    this.sum = source.sum;
  }
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
  copyFrom(source: RollingVariance): void {
    if (source.capacity !== this.capacity) throw new Error('incompatible rolling variance state');
    this.buffer.set(source.buffer); this.versions.set(source.versions);
    this.cursor = source.cursor; this.count = source.count; this.absoluteIndex = source.absoluteIndex; this.latestValue = source.latestValue;
    this.sum = source.sum; this.sumSquares = source.sumSquares;
  }
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
  select(rank:number):number|null { if(rank<0||rank>=this.size(this.root))return null; let n=this.root,k=Math.floor(rank);while(n){const left=this.size(n.left);if(k<left){n=n.left;continue;}if(k<left+n.count)return n.key;k-=left+n.count;n=n.right;}return null; }
  clear(){this.root=null;this.seed=0x9e3779b9;}
}

class BinaryHeap {
  private readonly data: number[] = [];
  constructor(private readonly higher: (a: number, b: number) => boolean) {}
  get size() { return this.data.length; }
  peek(): number | undefined { return this.data[0]; }
  push(value: number): void {
    let i = this.data.length;
    this.data.push(value);
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      if (this.higher(this.data[parent]!, value)) break;
      this.data[i] = this.data[parent]!;
      i = parent;
    }
    this.data[i] = value;
  }
  pop(): number | undefined {
    if (!this.data.length) return undefined;
    const root = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        if (left >= this.data.length) break;
        const right = left + 1;
        let child = left;
        if (right < this.data.length && this.higher(this.data[right]!, this.data[left]!)) child = right;
        if (this.higher(last, this.data[child]!)) break;
        this.data[i] = this.data[child]!;
        i = child;
      }
      this.data[i] = last;
    }
    return root;
  }
  values(): number[] { return this.data.slice(); }
  replace(values: number[]): void { this.data.length = 0; for (const value of values) this.push(value); }
}

class DualHeapMedian {
  private readonly lower = new BinaryHeap((a, b) => a > b);
  private readonly upper = new BinaryHeap((a, b) => a < b);
  private readonly delayed = new Map<number, number>();
  private lowerSize = 0;
  private upperSize = 0;

  private prune(heap: BinaryHeap): void {
    while (heap.size) {
      const value = heap.peek()!;
      const count = this.delayed.get(value) ?? 0;
      if (count <= 0) return;
      heap.pop();
      if (count === 1) this.delayed.delete(value); else this.delayed.set(value, count - 1);
    }
  }

  private rebalance(): void {
    this.prune(this.lower);
    this.prune(this.upper);
    if (this.lowerSize > this.upperSize + 1) {
      const value = this.lower.pop()!;
      this.lowerSize -= 1;
      this.upper.push(value);
      this.upperSize += 1;
      this.prune(this.lower);
    } else if (this.lowerSize < this.upperSize) {
      const value = this.upper.pop()!;
      this.upperSize -= 1;
      this.lower.push(value);
      this.lowerSize += 1;
      this.prune(this.upper);
    }
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    this.prune(this.lower);
    if (!this.lower.size || value <= this.lower.peek()!) {
      this.lower.push(value);
      this.lowerSize += 1;
    } else {
      this.upper.push(value);
      this.upperSize += 1;
    }
    this.rebalance();
  }

  remove(value: number): void {
    if (!Number.isFinite(value)) return;
    this.prune(this.lower);
    this.prune(this.upper);
    if (this.lower.size && value <= this.lower.peek()!) this.lowerSize -= 1;
    else this.upperSize -= 1;
    this.delayed.set(value, (this.delayed.get(value) ?? 0) + 1);
    this.prune(this.lower);
    this.prune(this.upper);
    this.rebalance();
  }

  median(): number | null {
    this.prune(this.lower);
    this.prune(this.upper);
    const total = this.lowerSize + this.upperSize;
    if (!total) return null;
    if (this.lowerSize > this.upperSize) return this.lower.peek()!;
    return ((this.lower.peek() ?? 0) + (this.upper.peek() ?? 0)) / 2;
  }

  clear(): void {
    this.lower.replace([]);
    this.upper.replace([]);
    this.delayed.clear();
    this.lowerSize = 0;
    this.upperSize = 0;
  }

  clone(): DualHeapMedian {
    const next = new DualHeapMedian();
    next.lower.replace(this.lower.values());
    next.upper.replace(this.upper.values());
    for (const [value, count] of this.delayed) next.delayed.set(value, count);
    next.lowerSize = this.lowerSize;
    next.upperSize = this.upperSize;
    return next;
  }

  copyFrom(source: DualHeapMedian): void {
    this.lower.replace(source.lower.values());
    this.upper.replace(source.upper.values());
    this.delayed.clear();
    for (const [value, count] of source.delayed) this.delayed.set(value, count);
    this.lowerSize = source.lowerSize;
    this.upperSize = source.upperSize;
  }
}

/** Exact rolling median in expected O(log period) per append/replace. */
export class RollingMedian extends RollingBase {
  private readonly heaps = new DualHeapMedian();
  private validCount = 0;

  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (mode === 'replace' && this.count) {
      const old = this.buffer[this.slotForCurrent()];
      if (Number.isFinite(old)) { this.heaps.remove(old); this.validCount -= 1; }
      this.replaceCurrentSlot(v);
    } else {
      if (this.count === this.capacity) {
        const old = this.buffer[this.cursor];
        if (Number.isFinite(old)) { this.heaps.remove(old); this.validCount -= 1; }
      }
      this.appendSlot(v);
    }
    if (Number.isFinite(v)) { this.heaps.add(v); this.validCount += 1; }
    return { count: this.count, value: this.value() };
  }

  value(): number | null {
    return this.count === this.capacity && this.validCount === this.capacity ? this.heaps.median() : null;
  }

  reset(): void { super.reset(); this.heaps.clear(); this.validCount = 0; }
  clone(): RollingMedian {
    const next = new RollingMedian(this.capacity);
    next.copyFrom(this);
    return next;
  }
  copyFrom(source: RollingMedian): void {
    if (source.capacity !== this.capacity) throw new Error('incompatible rolling median state');
    this.buffer.set(source.buffer);
    this.versions.set(source.versions);
    this.cursor = source.cursor;
    this.count = source.count;
    this.absoluteIndex = source.absoluteIndex;
    this.latestValue = source.latestValue;
    this.validCount = source.validCount;
    this.heaps.copyFrom(source.heaps);
  }
}

/** Exact rolling percentile/rank in expected O(log period) per append/replace. */
export class RollingPercentile extends RollingBase {
  private readonly ordered = new OrderedMultiset();
  private validCount = 0;

  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (mode === 'replace' && this.count) {
      const old = this.buffer[this.slotForCurrent()];
      if (Number.isFinite(old)) { this.ordered.erase(old); this.validCount -= 1; }
      this.replaceCurrentSlot(v);
    } else {
      if (this.count === this.capacity) {
        const old = this.buffer[this.cursor];
        if (Number.isFinite(old)) { this.ordered.erase(old); this.validCount -= 1; }
      }
      this.appendSlot(v);
    }
    if (Number.isFinite(v)) { this.ordered.insert(v); this.validCount += 1; }
    return { count: this.count, value: this.value() };
  }

  rank(value: number): number | null {
    const v = Number(value);
    if (!Number.isFinite(v) || this.count !== this.capacity || this.validCount === 0) return null;
    return this.ordered.countLE(v) / this.validCount;
  }

  percentile(q: number): number | null {
    if (this.count !== this.capacity || this.validCount === 0) return null;
    const target = Math.max(0, Math.min(1, Number(q) || 0)) * (this.validCount - 1);
    const loRank = Math.floor(target), hiRank = Math.ceil(target);
    const lo = this.ordered.select(loRank);
    const hi = this.ordered.select(hiRank);
    if (lo == null || hi == null) return null;
    return lo + (hi - lo) * (target - loRank);
  }

  value(): number | null { return this.percentile(0.5); }
  reset(): void { super.reset(); this.ordered.clear(); this.validCount = 0; }
}

/** Centered sliding extrema in O(N) using monotonic deques. */
export function centeredRollingExtrema(
  values: ArrayLike<number>,
  halfWindow: number,
  visit: (centerIndex: number, minimum: number, maximum: number) => void,
): void {
  const h = Math.max(1, Math.floor(halfWindow));
  const maxDeque: number[] = [], minDeque: number[] = [];
  let maxHead = 0, minHead = 0;
  for (let right = 0; right < values.length; right += 1) {
    const value = Number(values[right]);
    while (maxDeque.length > maxHead && Number(values[maxDeque[maxDeque.length - 1]!] ?? Number.NaN) <= value) maxDeque.pop();
    while (minDeque.length > minHead && Number(values[minDeque[minDeque.length - 1]!] ?? Number.NaN) >= value) minDeque.pop();
    maxDeque.push(right);
    minDeque.push(right);
    const left = right - 2 * h;
    while (maxHead < maxDeque.length && maxDeque[maxHead]! < left) maxHead += 1;
    while (minHead < minDeque.length && minDeque[minHead]! < left) minHead += 1;
    const center = right - h;
    if (center < h || center >= values.length - h || maxHead >= maxDeque.length || minHead >= minDeque.length) continue;
    visit(center, Number(values[minDeque[minHead]!]!), Number(values[maxDeque[maxHead]!]!));
    if (maxHead > 32 && maxHead * 2 > maxDeque.length) { maxDeque.splice(0, maxHead); maxHead = 0; }
    if (minHead > 32 && minHead * 2 > minDeque.length) { minDeque.splice(0, minHead); minHead = 0; }
  }
}

/** Exact rolling mean absolute deviation in expected O(log period) per append/replace. */
/** Exact rolling mean absolute deviation in expected O(log period) per append/replace. */
export class RollingAbsoluteDeviation extends RollingBase {
  private readonly ordered=new OrderedMultiset();
  private sum=0;
  update(value:number,mode:'append'|'replace'='append'):RollingWindowSnapshot {
    const v=Number(value);
    if(!Number.isFinite(v)){const mean=this.count===this.capacity?this.sum/this.capacity:null;return {count:this.count,value:this.value(mean)};}
    if(mode==='replace'&&this.count){const old=this.buffer[this.slotForCurrent()];this.ordered.erase(old);this.sum-=old;this.replaceCurrentSlot(v);}
    else {if(this.count===this.capacity){const old=this.buffer[this.cursor];this.ordered.erase(old);this.sum-=old;}this.appendSlot(v);}
    this.ordered.insert(v);this.sum+=v;
    const mean=this.count===this.capacity?this.sum/this.capacity:null;
    return {count:this.count,value:this.value(mean)};
  }
  value(mean:number|null){if(mean==null||this.count!==this.capacity)return null;const leftCount=this.ordered.countLE(mean),leftSum=this.ordered.sumLE(mean),rightCount=this.capacity-leftCount,rightSum=this.sum-leftSum;return(mean*leftCount-leftSum+rightSum-mean*rightCount)/this.capacity;}
  reset(){super.reset();this.ordered.clear();this.sum=0;}
}


class RollingExtremaTree {
  private readonly size: number;
  private readonly minTree: Float64Array;
  private readonly maxTree: Float64Array;
  constructor(capacity:number){
    let size=1; while(size<Math.max(1,capacity)) size<<=1; this.size=size;
    this.minTree=new Float64Array(size*2); this.maxTree=new Float64Array(size*2);
    this.minTree.fill(Number.POSITIVE_INFINITY); this.maxTree.fill(Number.NEGATIVE_INFINITY);
  }
  set(slot:number,value:number):void {
    let node=this.size+slot; this.minTree[node]=value; this.maxTree[node]=value;
    node>>=1;
    while(node){ const l=node*2,r=l+1; this.minTree[node]=Math.min(this.minTree[l]!,this.minTree[r]!); this.maxTree[node]=Math.max(this.maxTree[l]!,this.maxTree[r]!); node>>=1; }
  }
  min():number { return this.minTree[1] ?? Number.POSITIVE_INFINITY; }
  max():number { return this.maxTree[1] ?? Number.NEGATIVE_INFINITY; }
  clear():void { this.minTree.fill(Number.POSITIVE_INFINITY); this.maxTree.fill(Number.NEGATIVE_INFINITY); }
  copyFrom(source: RollingExtremaTree): void {
    if (source.size !== this.size) throw new Error('incompatible rolling extrema tree');
    this.minTree.set(source.minTree);
    this.maxTree.set(source.maxTree);
  }
}

/** Exact bounded rolling extrema. A segment tree is used because forming-bar replacement is a point update: unlike a plain monotonic deque, it never loses dominated values that may become extrema after replacement. */
export class RollingMinMax extends RollingBase {
  private readonly tree: RollingExtremaTree;
  constructor(period:number){super(period);this.tree=new RollingExtremaTree(this.capacity);}
  update(value:number,mode:'append'|'replace'='append'){
    const v=Number(value);
    if(!Number.isFinite(v)) return {count:this.count,min:this.min(),max:this.max()};
    const slot=mode==='replace'&&this.count ? this.slotForCurrent() : this.cursor;
    if (mode === 'replace' && this.count) this.replaceCurrentSlot(v);
    else this.appendSlot(v);
    this.tree.set(slot,v);
    return {count:this.count,min:this.min(),max:this.max()};
  }
  min(){ return this.count===this.capacity ? this.tree.min() : null; }
  max(){ return this.count===this.capacity ? this.tree.max() : null; }
  reset(){ super.reset(); this.tree.clear(); }
}
export class RollingSum extends RollingBase {
  private sum = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (!Number.isFinite(v)) return { count: this.count, value: this.value() };
    if (mode === 'replace' && this.count) { const old = this.buffer[this.slotForCurrent()]; this.sum += v - old; this.replaceCurrentSlot(v); }
    else { if (this.count === this.capacity) this.sum -= this.buffer[this.cursor]; this.appendSlot(v); this.sum += v; }
    return { count: this.count, value: this.value() };
  }
  value(): number | null { return this.count === this.capacity ? this.sum : null; }
  sumValue() { return this.sum; }
  reset() { super.reset(); this.sum = 0; }
  copyFrom(source: RollingSum): void {
    if (source.capacity !== this.capacity) throw new Error('incompatible rolling sum state');
    this.buffer.set(source.buffer); this.versions.set(source.versions);
    this.cursor = source.cursor; this.count = source.count; this.absoluteIndex = source.absoluteIndex; this.latestValue = source.latestValue;
    this.sum = source.sum;
  }
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
