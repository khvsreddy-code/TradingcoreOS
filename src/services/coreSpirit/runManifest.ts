import type { CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritMarketDataProvenance, CoreSpiritMarketDataset } from './marketData';
import { buildCoreSpiritArtifactIdentity, sha256Hex, type CoreSpiritArtifactIdentity } from './artifactIdentity';
import { CORE_SPIRIT_VERSION, CORE_SPIRIT_IR_VERSION } from './VERSION';

export const CORE_SPIRIT_RUN_MANIFEST_VERSION = 1 as const;
export type CoreSpiritRunManifest = Readonly<{
  version: typeof CORE_SPIRIT_RUN_MANIFEST_VERSION;
  languageVersion: string;
  irVersion: number;
  artifact: CoreSpiritArtifactIdentity;
  dataset: { id:string; checksum:string; symbol:string; timeframe:string; source:string; barCount:number; provenance?:CoreSpiritMarketDataProvenance; };
  execution: { target:string; mode:string; runId:string; timezone:string; };
  createdAt:string;
}>;
export async function buildCoreSpiritRunManifest(
  artifact: CoreSpiritExecutableArtifact,
  dataset: CoreSpiritMarketDataset,
  execution: {target:string;mode:string;runId:string;timezone:string},
  source=''
):Promise<CoreSpiritRunManifest>{
  const artifactIdentity=await buildCoreSpiritArtifactIdentity(artifact.ir,source);
  const datasetChecksum=dataset.checksum||await sha256Hex(JSON.stringify({symbol:dataset.symbol,timeframe:dataset.timeframe,bars:dataset.bars}));
  return Object.freeze({
    version:CORE_SPIRIT_RUN_MANIFEST_VERSION,languageVersion:CORE_SPIRIT_VERSION,irVersion:CORE_SPIRIT_IR_VERSION,
    artifact:artifactIdentity,
    dataset:{id:dataset.id,checksum:datasetChecksum,symbol:dataset.symbol,timeframe:dataset.timeframe,source:dataset.source,barCount:dataset.bars.length,provenance:dataset.provenance},
    execution,createdAt:new Date().toISOString()
  });
}
