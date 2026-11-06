/** Incremental evaluation, bounded memoization and low-overhead profiling primitives. */
export type CoreSpiritEvaluationNode=Readonly<{id:string;dependencies:readonly string[]}>;
export type CoreSpiritEvaluationPlan=Readonly<{revision:number;dirty:readonly string[];order:readonly string[];reused:readonly string[]}>;
export class CoreSpiritIncrementalGraph{
  private nodes=new Map<string,CoreSpiritEvaluationNode>(); private reverse=new Map<string,Set<string>>(); private revision=0;
  replace(nodes:readonly CoreSpiritEvaluationNode[]):void{
    const next=new Map<string,CoreSpiritEvaluationNode>(),reverse=new Map<string,Set<string>>();
    for(const node of nodes){if(!node.id||next.has(node.id))throw new Error('Evaluation node ids must be non-empty and unique.');next.set(node.id,Object.freeze({id:node.id,dependencies:Object.freeze([...new Set(node.dependencies)])}));}
    for(const node of next.values())for(const dep of node.dependencies){if(!next.has(dep))throw new Error('Unknown evaluation dependency '+dep+' for '+node.id);const set=reverse.get(dep)??new Set<string>();set.add(node.id);reverse.set(dep,set);}
    this.assertAcyclic(next);
    this.nodes=next;this.reverse=reverse;this.revision++;
  }
  private assertAcyclic(nodes:Map<string,CoreSpiritEvaluationNode>):void{
    const visiting=new Set<string>(),visited=new Set<string>();
    const visit=(id:string)=>{if(visiting.has(id))throw new Error('Evaluation dependency cycle at '+id);if(visited.has(id))return;visiting.add(id);for(const d of nodes.get(id)!.dependencies)visit(d);visiting.delete(id);visited.add(id);};
    for(const id of nodes.keys())visit(id);
  }
  plan(changed:readonly string[],cached:ReadonlySet<string>=new Set()):CoreSpiritEvaluationPlan{
    const dirty=new Set<string>(),queue=[...changed];
    for(const id of queue)if(!this.nodes.has(id))throw new Error('Unknown changed evaluation node '+id);
    while(queue.length){const id=queue.shift()!;if(dirty.has(id))continue;dirty.add(id);for(const child of this.reverse.get(id)??[])queue.push(child);}
    const order:string[]=[],visited=new Set<string>();
    const visit=(id:string)=>{if(visited.has(id)||!dirty.has(id))return;visited.add(id);for(const dep of this.nodes.get(id)!.dependencies)visit(dep);order.push(id);};
    for(const id of dirty)visit(id);
    const reused=[...this.nodes.keys()].filter(id=>!dirty.has(id)&&cached.has(id));
    return Object.freeze({revision:this.revision,dirty:Object.freeze([...dirty]),order:Object.freeze(order),reused:Object.freeze(reused)});
  }
}
type CacheEntry<V>={value:V;bytes:number;lastUsed:number};
export class CoreSpiritBoundedCache<V>{
  private entries=new Map<string,CacheEntry<V>>();private used=0;private clock=0;
  constructor(readonly maxBytes:number){if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Cache maxBytes must be a positive safe integer.');}
  get sizeBytes():number{return this.used;}
  get size():number{return this.entries.size;}
  get(key:string):V|undefined{const e=this.entries.get(key);if(!e)return undefined;e.lastUsed=++this.clock;return e.value;}
  set(key:string,value:V,bytes:number):void{
    if(!key||!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Cache key and byte estimate are invalid.');
    if(bytes>this.maxBytes)return;
    const previous=this.entries.get(key);if(previous){this.used-=previous.bytes;this.entries.delete(key);}
    while(this.used+bytes>this.maxBytes){let oldestKey:string|undefined,oldest=Infinity;for(const [k,e] of this.entries)if(e.lastUsed<oldest){oldest=e.lastUsed;oldestKey=k;}if(oldestKey===undefined)break;this.used-=this.entries.get(oldestKey)!.bytes;this.entries.delete(oldestKey);}
    this.entries.set(key,{value,bytes,lastUsed:++this.clock});this.used+=bytes;
  }
  delete(key:string):boolean{const e=this.entries.get(key);if(!e)return false;this.used-=e.bytes;return this.entries.delete(key);}
  clear():void{this.entries.clear();this.used=0;}
}
export type CoreSpiritProfileSample=Readonly<{name:string;phase:'data'|'compute'|'render'|'worker'|'queue';durationMs:number;bytes?:number;at:number}>;
export class CoreSpiritRuntimeProfiler{
  private samples:CoreSpiritProfileSample[]=[];private counters=new Map<string,number>();
  constructor(private readonly capacity=4096){if(!Number.isSafeInteger(capacity)||capacity<1||capacity>100_000)throw new Error('Profiler capacity is invalid.');}
  record(name:string,phase:CoreSpiritProfileSample['phase'],durationMs:number,bytes=0,at=Date.now()):void{
    if(!name||!Number.isFinite(durationMs)||durationMs<0||!Number.isFinite(bytes)||bytes<0||!Number.isFinite(at))return;
    this.samples.push(Object.freeze({name,phase,durationMs,bytes,at}));if(this.samples.length>this.capacity)this.samples.shift();
    this.counters.set(name,(this.counters.get(name)??0)+1);
  }
  snapshot():Readonly<{samples:readonly CoreSpiritProfileSample[];counts:Readonly<Record<string,number>>;p95Ms:number;trackedBytes:number}>{
    const durations=this.samples.map(s=>s.durationMs).sort((a,b)=>a-b),index=Math.max(0,Math.ceil(durations.length*.95)-1);
    return Object.freeze({samples:Object.freeze([...this.samples]),counts:Object.freeze(Object.fromEntries(this.counters)),
      p95Ms:durations.length?durations[index]!:0,trackedBytes:this.samples.reduce((sum,s)=>sum+(s.bytes??0),0)});
  }
}
