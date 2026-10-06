import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import type { CoreSpiritExecutableArtifact } from './artifact';
import { validateExecutableArtifact } from './artifact';
import { artifactBackendKey, type CoreSpiritExecutionBackend } from './artifactAbi';
import { sha256HexSync, type CoreSpiritArtifactIdentity } from './artifactIdentity';
import { buildCoreSpiritArtifactLookupIdentity, compileCoreSpirit } from './coreSpiritPipeline';

const DB_NAME='tradingcoreos-corespirit-artifacts';
const DB_VERSION=1;
const ARTIFACT_STORE='artifacts';
const ALIAS_STORE='aliases';
const MAX_PERSISTED_ARTIFACTS=128;
const MAX_MEMORY_ARTIFACTS=128;

export type CoreSpiritArtifactLookupOptions = Readonly<{
  backend?: CoreSpiritExecutionBackend;
  layer?: string;
  components?: CoreSpiritComponentRegistryLike;
}>;

type PersistedArtifactRecord = {
  artifactHash:string;
  backendKey:string;
  artifact:CoreSpiritExecutableArtifact;
  lastUsedAt:number;
};

type PersistedAliasRecord = {
  key:string;
  sourceHash:string;
  normalizedHash:string;
  semanticHash:string;
  programHash:string;
  artifactHash:string;
  backend:CoreSpiritExecutionBackend;
  lastUsedAt:number;
};

const memoryArtifacts=new Map<string,CoreSpiritExecutableArtifact>();
const sourceToNormalized=new Map<string,string>();
const normalizedToSemantic=new Map<string,string>();
const semanticToArtifact=new Map<string,string>();
const inFlight=new Map<string,Promise<CoreSpiritExecutableArtifact>>();
let databasePromise:Promise<IDBDatabase|null>|null=null;
let persistenceDisabled=false;

function memoryPut(key:string,artifact:CoreSpiritExecutableArtifact,identity:CoreSpiritArtifactIdentity):void{
  memoryArtifacts.delete(key);
  memoryArtifacts.set(key,artifact);
  sourceToNormalized.set(identity.sourceHash,identity.normalizedHash);
  normalizedToSemantic.set(identity.normalizedHash,identity.semanticHash);
  semanticToArtifact.set(identity.semanticHash,identity.artifactHash);
  while(memoryArtifacts.size>MAX_MEMORY_ARTIFACTS){
    memoryArtifacts.delete(memoryArtifacts.keys().next().value!);
  }
}

function canPersist():boolean{
  return typeof indexedDB!=='undefined';
}

function openDatabase():Promise<IDBDatabase|null>{
  if(databasePromise) return databasePromise;
  if(!canPersist() || persistenceDisabled) return Promise.resolve(null);
  databasePromise=new Promise((resolve)=>{
    try{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(ARTIFACT_STORE)){
          const store=db.createObjectStore(ARTIFACT_STORE,{keyPath:'artifactHash'});
          store.createIndex('lastUsedAt','lastUsedAt',{unique:false});
        }
        if(!db.objectStoreNames.contains(ALIAS_STORE)){
          const store=db.createObjectStore(ALIAS_STORE,{keyPath:'key'});
          store.createIndex('semanticHash','semanticHash',{unique:false});
          store.createIndex('lastUsedAt','lastUsedAt',{unique:false});
        }
      };
      request.onerror=()=>resolve(null);
      request.onblocked=()=>resolve(null);
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>db.close();
        resolve(db);
      };
    }catch{
      persistenceDisabled=true;
      resolve(null);
    }
  }).then((db)=>{
    if(!db) persistenceDisabled=true;
    return db;
  });
  return databasePromise;
}

async function getPersistentAlias(aliasKey:string):Promise<PersistedAliasRecord|undefined>{
  const db=await openDatabase();
  if(!db) return undefined;
  return new Promise((resolve)=>{
    try{
      const request=db.transaction(ALIAS_STORE,'readonly').objectStore(ALIAS_STORE).get(aliasKey);
      request.onsuccess=()=>resolve(request.result as PersistedAliasRecord|undefined);
      request.onerror=()=>resolve(undefined);
    }catch{
      resolve(undefined);
    }
  });
}

async function getPersistentArtifact(artifactHash:string):Promise<CoreSpiritExecutableArtifact|undefined>{
  const db=await openDatabase();
  if(!db) return undefined;
  return new Promise((resolve)=>{
    try{
      const request=db.transaction(ARTIFACT_STORE,'readonly').objectStore(ARTIFACT_STORE).get(artifactHash);
      request.onsuccess=()=>{
        const record=request.result as PersistedArtifactRecord|undefined;
        resolve(record?.artifact);
      };
      request.onerror=()=>resolve(undefined);
    }catch{
      resolve(undefined);
    }
  });
}

async function touchPersistentAlias(alias:PersistedAliasRecord):Promise<void>{
  const db=await openDatabase();
  if(!db) return;
  await new Promise<void>((resolve)=>{
    try{
      const tx=db.transaction([ALIAS_STORE,ARTIFACT_STORE],'readwrite');
      const now=Date.now();
      tx.objectStore(ALIAS_STORE).put({...alias,lastUsedAt:now});
      const request=tx.objectStore(ARTIFACT_STORE).get(alias.artifactHash);
      request.onsuccess=()=>{
        const record=request.result as PersistedArtifactRecord|undefined;
        if(record) tx.objectStore(ARTIFACT_STORE).put({...record,lastUsedAt:now});
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
      tx.onabort=()=>resolve();
    }catch{
      resolve();
    }
  });
}

async function prunePersistentStore(storeName:string,maxEntries:number,indexName:string):Promise<void>{
  const db=await openDatabase();
  if(!db) return;
  await new Promise<void>((resolve)=>{
    try{
      const tx=db.transaction(storeName,'readwrite');
      const store=tx.objectStore(storeName);
      const countRequest=store.count();
      countRequest.onsuccess=()=>{
        let excess=Math.max(0,countRequest.result-maxEntries);
        if(excess===0) return;
        const cursorRequest=store.index(indexName).openCursor();
        cursorRequest.onsuccess=()=>{
          const cursor=cursorRequest.result;
          if(!cursor || excess<=0) return;
          cursor.delete();
          excess-=1;
          cursor.continue();
        };
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
      tx.onabort=()=>resolve();
    }catch{
      resolve();
    }
  });
}

async function persistArtifact(
  aliasKey:string,
  identity:CoreSpiritArtifactIdentity,
  artifact:CoreSpiritExecutableArtifact,
  backend:CoreSpiritExecutionBackend,
):Promise<void>{
  if(!artifact.abi || artifact.abi.artifactHash!==identity.artifactHash) return;
  const db=await openDatabase();
  if(!db) return;

  const now=Date.now();
  await new Promise<void>((resolve)=>{
    try{
      const tx=db.transaction([ARTIFACT_STORE,ALIAS_STORE],'readwrite');
      tx.objectStore(ARTIFACT_STORE).put({
        artifactHash:identity.artifactHash,
        backendKey:artifactBackendKey(identity.artifactHash,backend),
        artifact,
        lastUsedAt:now,
      } satisfies PersistedArtifactRecord);
      tx.objectStore(ALIAS_STORE).put({
        key:aliasKey,
        sourceHash:identity.sourceHash,
        normalizedHash:identity.normalizedHash,
        semanticHash:identity.semanticHash,
        programHash:identity.programHash,
        artifactHash:identity.artifactHash,
        backend,
        lastUsedAt:now,
      } satisfies PersistedAliasRecord);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
      tx.onabort=()=>resolve();
    }catch{
      resolve();
    }
  });

  void prunePersistentStore(ARTIFACT_STORE,MAX_PERSISTED_ARTIFACTS,'lastUsedAt');
  void prunePersistentStore(ALIAS_STORE,MAX_PERSISTED_ARTIFACTS * 2,'lastUsedAt');
}

function identityFromArtifact(artifact:CoreSpiritExecutableArtifact):CoreSpiritArtifactIdentity{
  if(!artifact.abi) throw new Error('CoreSpirit persistent cache requires a formal artifact ABI');
  return Object.freeze({
    version:1,
    algorithm:'SHA-256',
    sourceId:artifact.sourceId,
    sourceHash:artifact.abi.sourceHash,
    normalizedHash:artifact.abi.normalizedHash,
    semanticHash:artifact.abi.semanticHash,
    programHash:artifact.abi.programHash,
    irHash:artifact.abi.irHash,
    artifactHash:artifact.abi.artifactHash,
  });
}

async function loadPersistentArtifact(
  aliasKey:string,
  expectedSemanticHash:string,
  backend:CoreSpiritExecutionBackend,
):Promise<CoreSpiritExecutableArtifact|undefined>{
  const alias=await getPersistentAlias(aliasKey);
  if(!alias || alias.backend!==backend || alias.semanticHash!==expectedSemanticHash) return undefined;

  const artifact=await getPersistentArtifact(alias.artifactHash);
  if(!artifact || !validateExecutableArtifact(artifact) || !artifact.abi) return undefined;
  if(artifact.abi.semanticHash!==expectedSemanticHash || artifact.abi.artifactHash!==alias.artifactHash) return undefined;

  void touchPersistentAlias(alias);
  return artifact;
}

export async function loadOrCompileCoreSpiritArtifact(
  source:string,
  sourceId='coreSpirit',
  options:CoreSpiritArtifactLookupOptions={},
):Promise<CoreSpiritExecutableArtifact>{
  const backend=options.backend || 'worker-vm';
  const lookup=buildCoreSpiritArtifactLookupIdentity(source,sourceId,options);
  const aliasKey=artifactBackendKey(lookup.key,backend);

  const existing=memoryArtifacts.get(aliasKey);
  if(existing && validateExecutableArtifact(existing) && existing.abi?.semanticHash===lookup.semanticHash) return existing;

  const active=inFlight.get(aliasKey);
  if(active) return active;

  const task=(async()=>{
    const persisted=await loadPersistentArtifact(aliasKey,lookup.semanticHash,backend);
    if(persisted){
      memoryPut(aliasKey,persisted,identityFromArtifact(persisted));
      return persisted;
    }

    const compiled=compileCoreSpirit(source,sourceId,{
      components:options.components,
      layer:options.layer as any,
    });
    const artifact=compiled.artifact;
    if(!artifact || !artifact.abi || !validateExecutableArtifact(artifact)){
      const message=compiled.diagnostics?.find(d=>d.severity==='error')?.message;
      throw new Error(message || 'CoreSpirit artifact compilation failed');
    }

    const identity=identityFromArtifact(artifact);
    if(identity.semanticHash!==lookup.semanticHash){
      throw new Error('CoreSpirit artifact semantic identity mismatch');
    }

    memoryPut(aliasKey,artifact,identity);
    await persistArtifact(aliasKey,identity,artifact,backend);
    return artifact;
  })();

  inFlight.set(aliasKey,task);
  try{
    return await task;
  }finally{
    inFlight.delete(aliasKey);
  }
}

export async function clearCoreSpiritArtifactCache():Promise<void>{
  memoryArtifacts.clear();
  sourceToNormalized.clear();
  normalizedToSemantic.clear();
  semanticToArtifact.clear();
  inFlight.clear();

  const db=await openDatabase();
  if(!db) return;

  await new Promise<void>((resolve)=>{
    try{
      const tx=db.transaction([ARTIFACT_STORE,ALIAS_STORE],'readwrite');
      tx.objectStore(ARTIFACT_STORE).clear();
      tx.objectStore(ALIAS_STORE).clear();
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
      tx.onabort=()=>resolve();
    }catch{
      resolve();
    }
  });
}

export type CoreSpiritArtifactCacheSnapshot=Readonly<{
  memoryEntries:number;
  sourceEntries:number;
  normalizedEntries:number;
  semanticEntries:number;
  persistentEnabled:boolean;
}>;

export function getCoreSpiritArtifactCacheSnapshot():CoreSpiritArtifactCacheSnapshot{
  return {
    memoryEntries:memoryArtifacts.size,
    sourceEntries:sourceToNormalized.size,
    normalizedEntries:normalizedToSemantic.size,
    semanticEntries:semanticToArtifact.size,
    persistentEnabled:canPersist() && !persistenceDisabled,
  };
}

export function coreSpiritArtifactLookupFingerprint(source:string,sourceId:string,options:CoreSpiritArtifactLookupOptions={}):string{
  const lookup=buildCoreSpiritArtifactLookupIdentity(source,sourceId,options);
  return sha256HexSync(`${lookup.sourceHash}\n${lookup.normalizedHash}\n${lookup.semanticHash}\n${lookup.key}`);
}


export type CoreSpiritArtifactCacheKey = Readonly<{
  compilerVersion:string;
  irVersion:number;
  sourceHash:string;
  semanticsHash:string;
}>;

function legacyCacheKey(input:CoreSpiritArtifactCacheKey):string{
  return sha256HexSync(JSON.stringify({
    compilerVersion:input.compilerVersion,
    irVersion:input.irVersion,
    sourceHash:input.sourceHash,
    semanticsHash:input.semanticsHash,
  }));
}

/** Backward-compatible local artifact cache API. */
export class CoreSpiritArtifactCache {
  private readonly entries=new Map<string,CoreSpiritExecutableArtifact>();
  constructor(private readonly maxEntries=256){}

  async get(keyInput:CoreSpiritArtifactCacheKey):Promise<CoreSpiritExecutableArtifact|undefined>{
    const key=legacyCacheKey(keyInput);
    const artifact=this.entries.get(key);
    if(!artifact) return undefined;
    this.entries.delete(key);
    this.entries.set(key,artifact);
    return validateExecutableArtifact(artifact) ? artifact : undefined;
  }

  async set(keyInput:CoreSpiritArtifactCacheKey,artifact:CoreSpiritExecutableArtifact):Promise<string>{
    if(!validateExecutableArtifact(artifact)) throw new Error('cannot cache invalid CoreSpirit artifact');
    const key=legacyCacheKey(keyInput);
    this.entries.delete(key);
    this.entries.set(key,artifact);
    while(this.entries.size>this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    return key;
  }

  clear():void{this.entries.clear();}
  get size():number{return this.entries.size;}
}
