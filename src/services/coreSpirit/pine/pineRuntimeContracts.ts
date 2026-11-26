import type { PineRuntimeContract, PineScriptKind, PineExecutionMode, PineDeclarationMode, PineStateClass } from './pineCompatibilityTypes';
export type { PineRuntimeContract, PineScriptKind, PineExecutionMode, PineDeclarationMode, PineStateClass } from './pineCompatibilityTypes';

export const PINE_EXECUTION_MODE_CONTRACT = Object.freeze({
  historical:Object.freeze({repeatedExecution:false,barConfirmed:true,rollbackBeforeNextRevision:false}),
  realtime:Object.freeze({repeatedExecution:true,barConfirmed:false,rollbackBeforeNextRevision:true}),
  replay:Object.freeze({repeatedExecution:false,barConfirmed:true,rollbackBeforeNextRevision:false}),
});
export const PINE_DECLARATION_MODE_CONTRACT = Object.freeze({
  default:Object.freeze({storage:'bar-local' as const,rollbackOnRevision:true,persistAcrossBars:false}),
  var:Object.freeze({storage:'committed-persistent' as const,rollbackOnRevision:true,persistAcrossBars:true}),
  varip:Object.freeze({storage:'intrabar-persistent' as const,rollbackOnRevision:false,persistAcrossBars:true}),
});
export const PINE_STATE_OWNERSHIP_CONTRACT:Readonly<Record<PineStateClass,string>>=Object.freeze({
  'bar-local':'execution frame / current script evaluation',
  'committed-persistent':'transactional program state, restored to confirmed-bar baseline before each realtime revision',
  'intrabar-persistent':'separate per-program store that survives realtime rollback within the same open bar',
  'series-history':'canonical series registry with committed-bar offsets',
  'drawing-reference':'retained visual object store with stable identity and revision journal',
  'function-call-site':'stateful call-site key plus confirmed-bar checkpoint',
  'external-model':'immutable artifact version and explicitly managed model runtime state',
});
export function validatePineRuntimeContract(contract:PineRuntimeContract):string[] {
  const errors:string[]=[];
  if(contract.declaration.kind!==contract.scriptKind)errors.push('script kind must match the parsed top-level Pine declaration');
  if(contract.declaration.version!==6)errors.push('only Pine v6 contracts are supported by this runtime adapter');
  if(!contract.seriesHistoryIsCausal)errors.push('historical series references must not observe future bars');
  if(!contract.outputsAreRevisioned)errors.push('developing-bar outputs must be revisioned, not appended as committed outputs');
  return errors;
}
