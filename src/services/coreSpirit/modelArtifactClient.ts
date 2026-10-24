import {
  coreSpiritSha256,
  verifyModelArtifactIntegrity,
  type ModelArtifact,
} from './modelArtifacts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState, type CoreSpiritHMMArtifactBinding } from './quantMath.js';
import type { CoreSpiritHMMArtifactResolver } from './runtime.js';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION.js';

type GaussianHMMWeights = Readonly<{
  modelType: 'gaussian-hmm';
  modelAlias: string;
  featureNames: readonly string[];
  hmm: CoreSpiritGaussianHMMState;
}>;

export type LoadedCoreSpiritHMMArtifact = Readonly<{
  artifactHash: string;
  artifactName: string;
  modelAlias: string;
  featureNames: readonly string[];
  toWorkerBinding: () => CoreSpiritHMMArtifactBinding;
  createRuntimeResolver: () => CoreSpiritHMMArtifactResolver;
}>;

/**
 * Fetches an owner-scoped, server-verified artifact and prepares an isolated
 * inference instance for one CoreSpiritRuntime. Never fetch this per candle.
 */
export async function fetchCoreSpiritHMMArtifact(
  artifactHash: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedCoreSpiritHMMArtifact> {
  const hash = artifactHash.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Model artifact hash must be a SHA-256 hex digest');
  if (!accessToken.trim()) throw new Error('A signed-in access token is required to load a private model artifact');

  const response = await fetcher('/api/corespirit/models/' + hash, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || 'Unable to load CoreSpirit model artifact (HTTP ' + response.status + ')');
  }
  const body = await response.json() as {
    success?: boolean;
    data?: {
      artifact?: ModelArtifact<unknown>;
      release?: { status?: string; approvalChecks?: Record<string, unknown> };
    };
  };
  const artifact = body?.data?.artifact;
  const release = body?.data?.release;
  if (!body?.success || !artifact || artifact.hash !== hash || !(await verifyModelArtifactIntegrity(artifact))) {
    throw new Error('Loaded CoreSpirit model artifact failed its content hash or integrity check');
  }
  if (release?.status !== 'approved' || release.approvalChecks?.productionEligible !== true) {
    throw new Error(
      'CoreSpirit model ' + artifact.name + ' is not approved for production inference. ' +
      'Review its chronological holdout, provenance, causality and lookahead report, then explicitly approve the exact artifact hash.',
    );
  }
  if (artifact.provenance.compilerVersion !== CORE_SPIRIT_COMPILER_VERSION ||
      artifact.provenance.irVersion !== String(CORE_SPIRIT_IR_VERSION) ||
      artifact.provenance.runtimeVersion !== CORE_SPIRIT_RUNTIME_VERSION ||
      artifact.provenance.dependencyVersions.corespiritCompiler !== CORE_SPIRIT_COMPILER_VERSION ||
      artifact.provenance.dependencyVersions.corespiritIr !== String(CORE_SPIRIT_IR_VERSION) ||
      artifact.provenance.dependencyVersions.corespiritRuntime !== CORE_SPIRIT_RUNTIME_VERSION ||
      artifact.provenance.modelImplementation !== 'corespirit-gaussian-hmm-v1' ||
      !artifact.contract) {
    throw new Error('CoreSpirit model ABI/version compatibility changed; retrain and re-approve this exact artifact hash before inference.');
  }
  const featureSchemaHash = await coreSpiritSha256({
    version: artifact.contract.featureSchema.version,
    orderedNames: artifact.contract.featureSchema.orderedNames,
    types: artifact.contract.featureSchema.types,
  });
  const boundFeatureNames = Array.isArray((artifact.weights as Partial<GaussianHMMWeights>)?.featureNames)
    ? (artifact.weights as Partial<GaussianHMMWeights>).featureNames! : [];
  if (featureSchemaHash !== artifact.contract.featureSchema.hash ||
      artifact.contract.featureSchema.orderedNames.length !== boundFeatureNames.length ||
      artifact.contract.featureSchema.orderedNames.some((name,index)=>name !== boundFeatureNames[index]) ||
      artifact.contract.validation.protocol !== artifact.provenance.validationResults.protocol ||
      artifact.contract.temporal.validationProtocol !== artifact.provenance.validationResults.protocol) {
    throw new Error('CoreSpirit model feature/validation ABI is incompatible with its immutable artifact contract.');
  }

  const weights = artifact.weights as Partial<GaussianHMMWeights>;
  if (weights.modelType !== 'gaussian-hmm' || typeof weights.modelAlias !== 'string' ||
      !weights.modelAlias.trim() || !Array.isArray(weights.featureNames) ||
      !weights.featureNames.length || !weights.hmm) {
    throw new Error('Artifact does not contain a supported Gaussian HMM inference payload');
  }
  if (new Set(weights.featureNames).size !== weights.featureNames.length ||
      weights.featureNames.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('Artifact feature schema is invalid');
  }

  const modelAlias = weights.modelAlias;
  const featureNames = Object.freeze([...weights.featureNames]);
  const hmmState = weights.hmm;
  const trainingEndText = artifact.provenance.trainingRange.to;
  const trainingEndDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trainingEndText);
  const trainingEndMs = Date.parse(trainingEndText) + (trainingEndDateOnly ? 86_399_999 : 0);
  const validationEndText = artifact.provenance.validationRange.to;
  const validationEndDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(validationEndText);
  const validationEndMs = Date.parse(validationEndText) + (validationEndDateOnly ? 86_399_999 : 0);
  const validationStartMs = Date.parse(artifact.provenance.validationRange.from);
  if (!Number.isFinite(trainingEndMs) || !Number.isFinite(validationEndMs) ||
      !Number.isFinite(validationStartMs) || trainingEndMs >= validationStartMs ||
      validationStartMs > validationEndMs) {
    throw new Error('Model artifact has invalid or overlapping training/validation boundaries');
  }
  // Production inference must start after the held-out validation period as well
  // as the fitted training period. CoreSpiritRuntime timestamps are epoch seconds.
  const runtimeInferenceBoundary = Math.floor(validationEndMs / 1000);
  return Object.freeze({
    artifactHash: artifact.hash,
    artifactName: artifact.name,
    modelAlias,
    featureNames,
    toWorkerBinding: () => Object.freeze({
      artifactHash: artifact.hash,
      modelAlias,
      trainingEndTimestampMs: trainingEndMs,
      inferenceBoundaryTimestampMs: validationEndMs,
      state: hmmState,
    }),
    createRuntimeResolver: () => {
      // A new mutable posterior state per runtime; learned parameters remain sealed.
      const model = CoreSpiritGaussianHMM.fromTrainedState(hmmState);
      model.setInferenceBoundaryExclusive(runtimeInferenceBoundary);
      return (requestedName: string) =>
        requestedName === modelAlias || requestedName === artifact.name || requestedName === artifact.hash
          ? model
          : undefined;
    },
  });
}
