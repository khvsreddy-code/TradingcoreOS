import {CORE_SPIRIT_BUILTINS,type CoreSpiritBuiltin} from './standardLibrary';
import {CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES} from './standardLibraryNamespaces';
import {CORE_SPIRIT_MEMBER_REGISTRY} from './memberRegistry';
import {PINE_V6_BUILTIN_REGISTRY} from './pineBuiltinRegistry';
/**
 * Canonical executable manifest projection. Existing registries remain source
 * adapters during migration; this projection detects duplicate/conflicting
 * signatures and never upgrades catalog-only entries to executable.
 */
export type CoreSpiritBuiltinManifestEntry=Readonly<{name:string;qualifiedNames:readonly string[];minArgs:number;maxArgs:number;returnType:string;pure:boolean;capability?:string;emitKind?:string;runtimeRegistered:boolean;autocompleteVisible:boolean;source:'standard-library'|'namespace'|'member'|'pine-v6';status:'executable'|'catalog-only'|'unresolved'}>;
const byName=new Map<string,CoreSpiritBuiltinManifestEntry>();
for(const builtin of CORE_SPIRIT_BUILTINS.values()){
 const qualified=CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES.filter(x=>x.status==='builtin'&&(x.canonicalBuiltin??x.member)===builtin.name).map(x=>x.qualifiedName);
 byName.set(builtin.name,Object.freeze({name:builtin.name,qualifiedNames:Object.freeze(qualified),minArgs:builtin.minArgs,maxArgs:builtin.maxArgs??builtin.minArgs,returnType:String(builtin.returnType),pure:builtin.pure,...(builtin.capability?{capability:builtin.capability}:{}),...(builtin.emitKind?{emitKind:builtin.emitKind}:{}),runtimeRegistered:false,autocompleteVisible:qualified.length>0,source:'standard-library',status:'unresolved'}));
}
const CORE_SPIRIT_BUILTIN_MANIFEST_CANDIDATES:readonly CoreSpiritBuiltinManifestEntry[]=[
 ...byName.values(),
 ...CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES.filter(x=>x.status==='catalog').map(x=>Object.freeze({name:x.qualifiedName,qualifiedNames:Object.freeze([x.qualifiedName]),minArgs:0,maxArgs:0,returnType:'unknown',pure:false,runtimeRegistered:false,autocompleteVisible:true,source:'namespace' as const,status:'catalog-only' as const})),
 ...PINE_V6_BUILTIN_REGISTRY.map(x=>{
  const runtime=false;
  const executable=false;
  const first=x.overloads[0];
  return Object.freeze({name:'pine.v6.'+x.qualifiedName,qualifiedNames:Object.freeze([x.qualifiedName]),minArgs:first?.minArgs??0,maxArgs:first?.maxArgs??0,returnType:first?.returnType??'unknown',pure:false,runtimeRegistered:runtime,autocompleteVisible:true,source:'pine-v6' as const,status:executable?'executable' as const:'catalog-only' as const});
 }),
 ...CORE_SPIRIT_MEMBER_REGISTRY.map(x=>Object.freeze({name:x.callName,qualifiedNames:Object.freeze([x.callName]),minArgs:x.minArgs,maxArgs:x.maxArgs??x.minArgs,returnType:String(x.returnType),pure:false,...(x.capability?{capability:x.capability}:{}),...(x.emitKind?{emitKind:x.emitKind}:{}),runtimeRegistered:false,autocompleteVisible:true,source:'member' as const,status:'unresolved' as const}))
];
const manifestByName=new Map<string,CoreSpiritBuiltinManifestEntry>();
for(const entry of CORE_SPIRIT_BUILTIN_MANIFEST_CANDIDATES){
 const previous=manifestByName.get(entry.name);
 if(previous&&previous.status!=='catalog-only'&&entry.status!=='catalog-only'&&(previous.minArgs!==entry.minArgs||previous.maxArgs!==entry.maxArgs||previous.returnType!==entry.returnType)){
  throw new Error('Conflicting CoreSpirit builtin signatures for '+entry.name+'.');
 }
 if(!previous||entry.status==='executable'||previous.status==='catalog-only')manifestByName.set(entry.name,entry);
}
export const CORE_SPIRIT_BUILTIN_MANIFEST:readonly CoreSpiritBuiltinManifestEntry[]=Object.freeze([...manifestByName.values()]);
export function validateCoreSpiritBuiltinManifest():readonly string[]{
 const errors:string[]=[];const names=new Set<string>();
 for(const entry of CORE_SPIRIT_BUILTIN_MANIFEST){
  if(names.has(entry.name))errors.push('duplicate manifest name: '+entry.name);names.add(entry.name);
  if(entry.status==='executable'&&(!entry.runtimeRegistered||entry.minArgs<0||entry.maxArgs<entry.minArgs))errors.push('invalid executable contract: '+entry.name);
 }
 const duplicates=new Map<string,CoreSpiritBuiltin[]>();
 for(const item of CORE_SPIRIT_BUILTINS.values()){const list=duplicates.get(item.name)??[];list.push(item);duplicates.set(item.name,list);}
 for(const [name,list] of duplicates)if(list.length>1)errors.push('duplicate runtime builtin: '+name);
 return Object.freeze(errors);
}
