import type { CoreSpiritModelManifest } from './modelAbi';
import type { CoreSpiritComponentContract, CoreSpiritComponentPort } from './coreSpiritExecutionModel';

function modelPort(name:string):CoreSpiritComponentPort{
  return Object.freeze({name,type:{kind:'feature' as const},required:true,description:`Model ABI tensor '${name}'.`});
}
function backendForModel(manifest:CoreSpiritModelManifest):'wasm'|'host'|'remote'{
  return manifest.backend==='wasm'?'wasm':manifest.backend==='native-rpc'?'remote':'host';
}
export function coreSpiritModelManifestToComponentContract(manifest:CoreSpiritModelManifest):CoreSpiritComponentContract{
  const stateful=manifest.state==='stateful';
  return Object.freeze({
    version:1,id:`model:${manifest.modelId}@${manifest.version}`,name:manifest.modelId,
    aliases:Object.freeze([`model.${manifest.modelId}`]),kind:'model',
    inputs:Object.freeze(manifest.inputNames.map(modelPort)),outputs:Object.freeze(manifest.outputNames.map(modelPort)),
    nodeIds:Object.freeze([`model:${manifest.modelId}`]),dependencies:Object.freeze([]),
    deterministic:manifest.deterministic,stateful,capabilities:Object.freeze([...manifest.capabilities]),
    execution:Object.freeze({
      executionClass:stateful?'stateful':'pure',latencyClass:'external',estimatedCost:'external',
      cacheable:false,parallelizable:!stateful,eligibleBackends:Object.freeze([backendForModel(manifest)]),
    }),
    state:Object.freeze({
      persistence:stateful?'external':'stateless',snapshotable:stateful,rollbackable:stateful,
      ...(stateful?{key:`model:${manifest.modelId}@${manifest.version}`}:{}),
    }),
    documentation:Object.freeze({summary:`MODEL ABI ${manifest.modelId}@${manifest.version} projected into the semantic component graph.`}),
  });
}
