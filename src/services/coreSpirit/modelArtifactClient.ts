import {
  verifyModelArtifactIntegrity,
  type ModelArtifact,
} from './modelArtifacts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState, type CoreSpiritHMMArtifactBinding } from './quantMath.js';
import type { CoreSpiritHMMArtifactResolver } from './runtime.js';
import { extractCoreSpiritFeatureDefinitions } from './coreSpiritFeatureMaterializer.js';
import { lowerCoreSpiritLiveInferenceSource, parseCoreSpiritModelLifecycleSurface } from './modelLifecycleSurface.js';

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

async function hydrateCoreSpiritHMMArtifact(
  artifact: ModelArtifact<unknown>,
  expectedHash?: string,
): Promise<LoadedCoreSpiritHMMArtifact> {
  const hash = artifact.hash.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || (expectedHash && hash !== expectedHash.toLowerCase()) ||
      !(await verifyModelArtifactIntegrity(artifact))) {
    throw new Error('Loaded CoreSpirit model artifact failed its content hash or integrity check');
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
  if (!Number.isFinite(trainingEndMs)) throw new Error('Model artifact has an invalid training-range boundary');
  // CoreSpiritRuntime timestamps are epoch seconds, whereas the public API uses milliseconds.
  const runtimeTrainingBoundary = Math.floor(trainingEndMs / 1000);
  return Object.freeze({
    artifactHash: artifact.hash,
    artifactName: artifact.name,
    modelAlias,
    featureNames,
    toWorkerBinding: () => Object.freeze({ artifactHash: artifact.hash, artifactName: artifact.name, modelAlias, trainingEndTimestampMs: trainingEndMs, state: hmmState }),
    createRuntimeResolver: () => {
      // A new mutable posterior state per runtime; learned parameters remain sealed.
      const model = CoreSpiritGaussianHMM.fromTrainedState(hmmState);
      model.setInferenceBoundaryExclusive(runtimeTrainingBoundary);
      return (requestedName: string) =>
        requestedName === modelAlias || requestedName === artifact.name || requestedName === artifact.hash
          ? model
          : undefined;
    },
  });
}

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
  const body = await response.json() as { success?: boolean; data?: { artifact?: ModelArtifact<unknown> } };
  const artifact = body?.data?.artifact;
  if (!body?.success || !artifact) throw new Error('Model artifact lookup returned no artifact');
  return hydrateCoreSpiritHMMArtifact(artifact, hash);
}

/**
 * Prepare a CoreScript source containing loadModel(...) for chart execution.
 * This is a one-time selection/load operation: the returned source is lowered
 * to the existing model(name).predict ABI and the verified artifact binding is
 * passed to the persistent worker. No network call belongs in a candle loop.
 */
export type PreparedCoreSpiritLiveInference = Readonly<{
  source: string;
  artifactHash: string;
  artifactName: string;
  featureNames: readonly string[];
  hmmArtifacts: readonly CoreSpiritHMMArtifactBinding[];
}>;

export async function prepareCoreSpiritLiveInference(
  source: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<PreparedCoreSpiritLiveInference> {
  const plan = parseCoreSpiritModelLifecycleSurface(source);
  if (!plan.loadModelName) {
    throw new Error('Live model inference source must declare model = loadModel("artifact-name").');
  }
  const featureNames = extractCoreSpiritFeatureDefinitions(source).map(definition => definition.name);
  const loaded = /^[a-f0-9]{64}$/i.test(plan.loadModelName)
    ? await fetchCoreSpiritHMMArtifact(plan.loadModelName, accessToken, fetcher)
    : await fetchCoreSpiritHMMArtifactByName(plan.loadModelName, accessToken, fetcher);
  if (featureNames.length !== loaded.featureNames.length ||
      featureNames.some((name, index) => name !== loaded.featureNames[index])) {
    throw new Error('CoreScript feature names/order do not match the sealed model artifact schema.');
  }
  const loweredSource = lowerCoreSpiritLiveInferenceSource(source, plan);
  if (!loweredSource.trim()) throw new Error('Live inference source is empty after lifecycle lowering.');
  return Object.freeze({
    source: loweredSource,
    artifactHash: loaded.artifactHash,
    artifactName: loaded.artifactName,
    featureNames: loaded.featureNames,
    hmmArtifacts: Object.freeze([loaded.toWorkerBinding()]),
  });
}

/** Resolve a human-readable immutable model name once, then pin the runtime to its SHA-256. */
export async function fetchCoreSpiritHMMArtifactByName(
  artifactName: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedCoreSpiritHMMArtifact> {
  const name = artifactName.trim();
  if (!name || name.length > 120) throw new Error('Model artifact name must be 1–120 characters');
  if (!accessToken.trim()) throw new Error('A signed-in access token is required to load a private model artifact');
  const response = await fetcher('/api/corespirit/models/by-name/' + encodeURIComponent(name), {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || 'Unable to load CoreSpirit model artifact (HTTP ' + response.status + ')');
  }
  const body = await response.json() as { success?: boolean; data?: { artifact?: ModelArtifact<unknown> } };
  const artifact = body?.data?.artifact;
  if (!body?.success || !artifact || artifact.name !== name) {
    throw new Error('Model name lookup returned an unexpected artifact');
  }
  return hydrateCoreSpiritHMMArtifact(artifact);
}
