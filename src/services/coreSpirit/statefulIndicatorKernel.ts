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
  copyFrom(source: MonotonicDeque): void {
    if (source.direction !== this.direction) throw new Error('incompatible monotonic deque');
    this.data = source.data.map((entry) => ({ ...entry }));
    this.head = source.head;
  }
  clone(): MonotonicDeque {
    const next = new MonotonicDeque(this.direction);
    next.copyFrom(this);
    return next;
  }
}

abstract class RollingBase {
  protected readonly capacity: number;
  protected readonly buffer: Float64Array;
  protected readonly versions: Uint32Array;
  protected cursor = 0;
  protected count = 0;
  protected absoluteIndex = 0;
  protected latestValue: number | null = null;
  constructor(period: number) {
    this.capacity = Math.max(1, Math.floor(period));
    this.buffer = new Float64Array(this.capacity);
    this.versions = new Uint32Array(this.capacity);
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

/** O(1) bounded rolling minimum using the shared monotonic-deque state. */
export class RollingMin extends RollingBase {
  private readonly state: RollingMinMax;
  constructor(period:number){super(period);this.state=new RollingMinMax(period);}
  update(value:number,mode:'append'|'replace'='append'):RollingWindowSnapshot{const snapshot=this.state.update(value,mode);this.appendMirror(value,mode);return {count:snapshot.count,value:snapshot.min??null};}
  value():number|null{return this.state.min();}
  reset(){super.reset();this.state.reset();}
  private appendMirror(_value:number,_mode:'append'|'replace'):void{}
}
/** O(1) bounded rolling maximum using the shared monotonic-deque state. */
export class RollingMax extends RollingBase {
  private readonly state: RollingMinMax;
  constructor(period:number){super(period);this.state=new RollingMinMax(period);}
  update(value:number,mode:'append'|'replace'='append'):RollingWindowSnapshot{const snapshot=this.state.update(value,mode);this.appendMirror(value,mode);return {count:snapshot.count,value:snapshot.max??null};}
  value():number|null{return this.state.max();}
  reset(){super.reset();this.state.reset();}
  private appendMirror(_value:number,_mode:'append'|'replace'):void{}
}

export class RollingMean extends RollingBase {
  copyFrom(source: RollingMean): void { if (source.capacity !== this.capacity) throw new Error('incompatible rolling mean state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.sum=source.sum; }

  private sum = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    // A finite rolling window must not bridge missing market observations. The
    // batch CPU kernels and WASM ABI both yield NaN until a complete new window
    // has formed; keep the incremental stateful path on that same contract.
    if (!Number.isFinite(v)) {
      this.reset();
      return { count: this.count, value: this.value() };
    }
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
  copyFrom(source: RollingVariance): void { if (source.capacity !== this.capacity) throw new Error('incompatible rolling variance state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.sum=source.sum; this.sumSquares=source.sumSquares; }

  private sum = 0;
  private sumSquares = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    // Keep stateful rolling variance/std aligned with the batch kernel's
    // right-aligned, all-finite-window contract after missing observations.
    if (!Number.isFinite(v)) {
      this.reset();
      return { count: this.count, value: this.value() };
    }
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
  copyFrom(source:RollingExtremaTree):void { this.minTree.set(source.minTree); this.maxTree.set(source.maxTree); }
}

/** Exact bounded rolling extrema. A segment tree gives deterministic O(log P)
 * append and point-replacement updates. It is used here because forming-bar
 * replacement is a true point update; a monotonic deque can discard a value
 * that becomes the extrema again after replacement. */

export class RollingMinMax extends RollingBase {
  copyFrom(source: RollingMinMax): void { if (source.capacity !== this.capacity) throw new Error('incompatible rolling minmax state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.tree.copyFrom(source.tree); }

  private readonly tree: RollingExtremaTree;
  constructor(period:number){super(period);this.tree=new RollingExtremaTree(this.capacity);}
  update(value:number,mode:'append'|'replace'='append'){
    const v=Number(value);
    // Extrema are invalid while any member of the rolling window is missing.
    // Resetting here makes the incremental and batch implementations agree.
    if(!Number.isFinite(v)) {
      this.reset();
      return {count:this.count,min:this.min(),max:this.max()};
    }

    if(mode==='replace'&&this.count){
      // A forming-bar revision changes the current slot; it is not a new bar.
      // Keep the cursor/absolute index unchanged so downstream rolling state
      // remains aligned with the historical timeline.
      const slot=this.slotForCurrent();
      this.replaceCurrentSlot(v);
      this.tree.set(slot,v);
    }else{
      const slot=this.cursor;
      this.appendSlot(v);
      this.tree.set(slot,v);
    }

    return {count:this.count,min:this.min(),max:this.max()};
  }
  min(){ return this.count===this.capacity ? this.tree.min() : null; }
  max(){ return this.count===this.capacity ? this.tree.max() : null; }
  reset(){ super.reset(); this.tree.clear(); }
}
export class RollingSum extends RollingBase {
  copyFrom(source: RollingSum): void { if (source.capacity !== this.capacity) throw new Error('incompatible rolling sum state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.sum=source.sum; }

  private sum = 0;
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    // Rolling kernels use complete finite windows. Do not silently retain the
    // previous window when a market-data gap is observed.
    if (!Number.isFinite(v)) {
      this.reset();
      return { count: this.count, value: this.value() };
    }
    if (mode === 'replace' && this.count) { const old = this.buffer[this.slotForCurrent()]; this.sum += v - old; this.replaceCurrentSlot(v); }
    else { if (this.count === this.capacity) this.sum -= this.buffer[this.cursor]; this.appendSlot(v); this.sum += v; }
    return { count: this.count, value: this.value() };
  }
  value(): number | null { return this.count === this.capacity ? this.sum : null; }
  sumValue() { return this.sum; }
  reset() { super.reset(); this.sum = 0; }
}

export class EMAState {
  copyFrom(source: EMAState): void { if (source.period !== this.period) throw new Error('incompatible EMA state'); this.seed.copyFrom(source.seed); this.valueState=source.valueState; this.stableBeforeCurrent=source.stableBeforeCurrent; this.currentInput=source.currentInput; }

  protected readonly period: number;
  protected readonly seed: RollingMean;
  protected valueState: number | null = null;
  protected stableBeforeCurrent: number | null = null;
  protected currentInput: number | null = null;
  constructor(period: number) { this.period = Math.max(1, Math.floor(period)); this.seed = new RollingMean(this.period); }
  update(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value); if (!Number.isFinite(v)) return this.valueState;
    if (mode === 'replace' && this.currentInput != null) {
      this.seed.update(v, 'replace'); this.currentInput = v;
      if (this.seed.size < this.period) { this.valueState = null; this.stableBeforeCurrent = null; }
      else if (this.stableBeforeCurrent == null) { this.valueState = this.seed.value(); }
      else { const alpha = 2 / (this.period + 1); this.valueState = alpha * v + (1 - alpha) * this.stableBeforeCurrent; }
      return this.valueState;
    }
    this.seed.update(v, 'append'); this.currentInput = v;
    if (this.seed.size < this.period) { this.valueState = null; return null; }
    if (this.valueState == null) { this.valueState = this.seed.value(); this.stableBeforeCurrent = null; return this.valueState; }
    this.stableBeforeCurrent = this.valueState;
    const alpha = 2 / (this.period + 1); this.valueState = alpha * v + (1 - alpha) * this.valueState;
    return this.valueState;
  }
  reset() { this.seed.reset(); this.valueState = null; this.stableBeforeCurrent = null; this.currentInput = null; }
  get value() { return this.valueState; }
}

export class WilderState {
  copyFrom(source: WilderState): void { if (source.period !== this.period) throw new Error('incompatible Wilder state'); this.seed.copyFrom(source.seed); this.valueState=source.valueState; this.stableBeforeCurrent=source.stableBeforeCurrent; this.currentInput=source.currentInput; }

  readonly period: number;
  private readonly seed: RollingMean;
  private valueState: number | null = null;
  private stableBeforeCurrent: number | null = null;
  private currentInput: number | null = null;
  constructor(period: number) { this.period = Math.max(1, Math.floor(period)); this.seed = new RollingMean(this.period); }
  updateWilder(value: number, mode: 'append' | 'replace' = 'append') {
    const v = Number(value); if (!Number.isFinite(v)) return this.valueState;
    if (mode === 'replace' && this.currentInput != null) {
      this.seed.update(v, 'replace'); this.currentInput = v;
      if (this.seed.size < this.period) { this.valueState = null; this.stableBeforeCurrent = null; }
      else if (this.stableBeforeCurrent == null) { this.valueState = this.seed.value(); }
      else { this.valueState = ((this.period - 1) * this.stableBeforeCurrent + v) / this.period; }
      return this.valueState;
    }
    this.seed.update(v, 'append'); this.currentInput = v;
    if (this.seed.size < this.period) { this.valueState = null; return null; }
    if (this.valueState == null) { this.valueState = this.seed.value(); this.stableBeforeCurrent = null; return this.valueState; }
    this.stableBeforeCurrent = this.valueState;
    this.valueState = ((this.period - 1) * this.valueState + v) / this.period;
    return this.valueState;
  }
  update(value: number, mode: 'append' | 'replace' = 'append') { return this.updateWilder(value, mode); }
  reset() { this.seed.reset(); this.valueState = null; this.stableBeforeCurrent = null; this.currentInput = null; }
  get value() { return this.valueState; }
}

export class ATRState {
  private readonly wilder: WilderState;
  /** Close immediately before the currently forming bar. */
  private previousBarClose: number | null = null;
  /** Close of the currently forming/last processed bar. */
  private currentClose: number | null = null;
  private latestTR: number | null = null;
  constructor(period: number) { this.wilder = new WilderState(period); }
  update(high: number, low: number, close: number, mode: 'append' | 'replace' = 'append') {
    const h = Number(high), l = Number(low), c = Number(close); if (![h,l,c].every(Number.isFinite)) return null;

    // New bars use the prior bar's close. A forming-bar replacement must keep
    // using that same prior close rather than accidentally using the current
    // bar's revised close as its own previous close.
    const referenceClose = mode === 'replace' ? this.previousBarClose : this.currentClose;
    const tr = referenceClose == null
      ? h - l
      : Math.max(h - l, Math.abs(h - referenceClose), Math.abs(l - referenceClose));

    const result = this.wilder.updateWilder(tr, mode);
    this.latestTR = tr;

    if (mode === 'append') {
      this.previousBarClose = this.currentClose;
      this.currentClose = c;
    }

    return result;
  }
  replacePreviousClose(close: number) { /* previous-bar close is intentionally unchanged on same-bar replacement */ void close; }
  get trueRange() { return this.latestTR; }
  get value() { return this.wilder.value; }
  reset() { this.wilder.reset(); this.previousBarClose = null; this.currentClose = null; this.latestTR = null; }
  clone(): ATRState { const next = new ATRState(this.wilder.period); next.copyFrom(this); return next; }
  copyFrom(source: ATRState): void {
    if (source.wilder.period !== this.wilder.period) throw new Error('incompatible ATR state');
    this.wilder.copyFrom(source.wilder);
    this.previousBarClose = source.previousBarClose;
    this.currentClose = source.currentClose;
    this.latestTR = source.latestTR;
  }
}

export class WMAState extends RollingBase {
  copyFrom(source: WMAState): void { if (source.capacity !== this.capacity) throw new Error('incompatible WMA state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.weighted=source.weighted; this.sum=source.sum; this.currentInput=source.currentInput; }

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
  get value(): number | null { return this.count === this.capacity ? this.weighted / (this.capacity * (this.capacity + 1) / 2) : null; }
}

function copyVwapSessions(target: Map<string, { pv: number; volume: number }>, source: Map<string, { pv: number; volume: number }>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, { pv: value.pv, volume: value.volume });
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
  clone(): VWAPSessionState { const next = new VWAPSessionState(); next.copyFrom(this); return next; }
  copyFrom(source: VWAPSessionState): void {
    copyVwapSessions(this.sessions, source.sessions);
    this.lastKey = source.lastKey;
    this.lastPV = source.lastPV;
    this.lastVolume = source.lastVolume;
    this.lastValue = source.lastValue;
  }
}

/** Stateful one-bar change kernel. */
/** Wilder RSI kernel with forming-bar replacement support. */
export class RSIState {
  private readonly period:number;
  private previous:number|null=null;
  private stablePrevious:number|null=null;
  private avgGain:number|null=null;
  private avgLoss:number|null=null;
  private stableGain:number|null=null;
  private stableLoss:number|null=null;
  private seedGain=0;
  private seedLoss=0;
  private seedCount=0;
  private currentValue:number|null=null;
  constructor(period:number){this.period=Math.max(1,Math.floor(period));}
  private valueFrom(g:number,l:number){return l===0?(g===0?50:100):100-(100/(1+g/l));}
  update(value:number, mode:'append'|'replace'='append'):number|null {
    const v=Number(value); if(!Number.isFinite(v)) return null;
    if(this.previous==null){this.previous=v;return null;}
    const prior = mode==='replace' && this.stablePrevious!=null ? this.stablePrevious : this.previous;
    const d=v-prior,g=Math.max(d,0),l=Math.max(-d,0);
    if(mode==='replace' && this.avgGain!=null && this.avgLoss!=null && this.stableGain!=null && this.stableLoss!=null){
      this.currentValue=this.valueFrom((this.period-1)*this.stableGain/this.period+g/this.period,(this.period-1)*this.stableLoss/this.period+l/this.period);
      this.avgGain=(this.period-1)*this.stableGain/this.period+g/this.period;
      this.avgLoss=(this.period-1)*this.stableLoss/this.period+l/this.period;
      this.previous=v; return this.currentValue;
    }
    this.stablePrevious=this.previous;
    this.previous=v;
    if(this.seedCount<this.period){this.seedGain+=g;this.seedLoss+=l;this.seedCount+=1;if(this.seedCount<this.period)return null;this.avgGain=this.seedGain/this.period;this.avgLoss=this.seedLoss/this.period;this.stableGain=null;this.stableLoss=null;}
    else {this.stableGain=this.avgGain;this.stableLoss=this.avgLoss;this.avgGain=((this.period-1)*(this.avgGain??0)+g)/this.period;this.avgLoss=((this.period-1)*(this.avgLoss??0)+l)/this.period;}
    this.currentValue=this.valueFrom(this.avgGain??0,this.avgLoss??0); return this.currentValue;
  }
  reset(){this.previous=null;this.stablePrevious=null;this.avgGain=null;this.avgLoss=null;this.stableGain=null;this.stableLoss=null;this.seedGain=0;this.seedLoss=0;this.seedCount=0;this.currentValue=null;}
  clone(): RSIState { const next = new RSIState(this.period); next.copyFrom(this); return next; }
  copyFrom(source: RSIState): void {
    if (source.period !== this.period) throw new Error('incompatible RSI state');
    this.previous = source.previous; this.stablePrevious = source.stablePrevious; this.avgGain = source.avgGain; this.avgLoss = source.avgLoss;
    this.stableGain = source.stableGain; this.stableLoss = source.stableLoss;
    this.seedGain = source.seedGain; this.seedLoss = source.seedLoss; this.seedCount = source.seedCount;
    this.currentValue = source.currentValue;
  }
}

export class ChangeState {
  private previous = Number.NaN;
  constructor(private readonly percentage = false) {}
  update(value: number): number | null {
    const current = Number(value);
    const previous = this.previous;
    this.previous = current;
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    return this.percentage ? (previous === 0 ? null : current / previous - 1) : current - previous;
  }
  reset(): void { this.previous = Number.NaN; }
  clone(): ChangeState { const next = new ChangeState(this.percentage); next.previous = this.previous; return next; }
  copyFrom(source: ChangeState): void {
    if (source.percentage !== this.percentage) throw new Error('incompatible change state');
    this.previous = source.previous;
  }
}

/** Stateful persistence kernel: same-direction changes / valid changes in the bounded window. */
export class PersistenceState extends RollingBase {
  private readonly signs: Int8Array;
  private same = 0;
  private comparisons = 0;
  private previousValue = Number.NaN;
  private previousSign = 0;
  constructor(period: number) { super(period); this.signs = new Int8Array(this.capacity); }
  update(value: number, mode: 'append' | 'replace' = 'append'): RollingWindowSnapshot {
    const v = Number(value);
    if (mode === 'replace' && this.count) {
      // Replacing the forming bar changes only the final comparison. Recompute
      // that bounded edge from the previous stable value instead of advancing state.
      const slot = this.slotForCurrent();
      const oldSign = this.signs[slot]!;
      if (oldSign !== 0 && this.previousSign !== 0) {
        this.comparisons -= 1;
        if (oldSign === this.previousSign) this.same -= 1;
      }
      const prior = this.count > 1 ? this.buffer[(slot - 1 + this.capacity) % this.capacity]! : Number.NaN;
      const sign = Number.isFinite(prior) && Number.isFinite(v) ? (v > prior ? 1 : v < prior ? -1 : 0) : 0;
      this.signs[slot] = sign;
      this.replaceCurrentSlot(v);
      if (sign !== 0 && this.previousSign !== 0) {
        this.comparisons += 1;
        if (sign === this.previousSign) this.same += 1;
      }
      this.previousValue = v;
      return { count: this.count, value: this.value() };
    }
    if (this.count === this.capacity) {
      const evicted = this.signs[this.cursor]!;
      const nextSlot = (this.cursor + 1) % this.capacity;
      const nextSign = this.signs[nextSlot]!;
      if (evicted !== 0 && nextSign !== 0) {
        this.comparisons -= 1;
        if (evicted === nextSign) this.same -= 1;
      }
    }
    const prior = this.previousValue;
    const sign = Number.isFinite(prior) && Number.isFinite(v) ? (v > prior ? 1 : v < prior ? -1 : 0) : 0;
    const slot = this.cursor;
    this.appendSlot(v);
    this.signs[slot] = sign;
    const previousSign = this.count > 1 ? this.signs[(slot - 1 + this.capacity) % this.capacity]! : 0;
    if (sign !== 0 && previousSign !== 0) { this.comparisons += 1; if (sign === previousSign) this.same += 1; }
    this.previousValue = v;
    this.previousSign = sign;
    return { count: this.count, value: this.value() };
  }
  value(): number | null { return this.count === this.capacity ? (this.comparisons ? this.same / this.comparisons : 0) : null; }
  copyFrom(source: PersistenceState): void { if (source.capacity !== this.capacity) throw new Error('incompatible persistence state'); this.buffer.set(source.buffer); this.versions.set(source.versions); this.signs.set(source.signs); this.cursor=source.cursor; this.count=source.count; this.absoluteIndex=source.absoluteIndex; this.latestValue=source.latestValue; this.same=source.same; this.comparisons=source.comparisons; this.previousValue=source.previousValue; this.previousSign=source.previousSign; }
  reset(): void { super.reset(); this.signs.fill(0); this.same=0; this.comparisons=0; this.previousValue=Number.NaN; this.previousSign=0; }
}

export function sourceValue(candle: { open:number; high:number; low:number; close:number }, source: string = 'close'): number {
  switch (source) {
    case 'open': return candle.open; case 'high': return candle.high; case 'low': return candle.low; case 'hl2': return (candle.high + candle.low) / 2;
    case 'hlc3': return (candle.high + candle.low + candle.close) / 3; case 'ohlc4': return (candle.open + candle.high + candle.low + candle.close) / 4;
    case 'hlcc4': return (candle.high + candle.low + candle.close + candle.close) / 4; default: return candle.close;
  }
}
