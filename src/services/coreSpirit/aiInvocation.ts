import { coreSpiritCopilotSha256 } from './copilotDraft.js';

export const CORE_SPIRIT_AI_INVOKE_LIMITS = Object.freeze({
  maxSourceBytes: 64 * 1024,
  maxPromptChars: 2_000,
  maxContextBytes: 16 * 1024,
  maxOutputTokens: 1_024,
  defaultOutputTokens: 512,
  providerTimeoutMs: 20_000,
  resultFreshnessMs: 60_000,
  cacheTtlMs: 5 * 60_000,
  maxJobsPerMinute: 6,
  maxJobsPerHour: 30,
  maxConcurrentJobsPerUser: 1,
  concurrencyLeaseMs: 4 * 60_000,
});

export type CoreSpiritAiInvocationRequest = Readonly<{
  source: string;
  artifactHash: string;
  prompt: string;
  context: Readonly<Record<string, unknown>>;
  outputTokenLimit: number;
}>;

export type CoreSpiritAiInvocationJobPayload = Readonly<{
  invocationId: string;
  source: string;
  sourceHash: string;
  artifactHash: string;
  prompt: string;
  context: Readonly<Record<string, unknown>>;
  contextHash: string;
  inputFingerprint: string;
  modelVersion: string;
  outputTokenLimit: number;
  createdAt: string;
  lockKey: string;
  lockOwner: string;
  cacheKey: string;
}>;

export type CoreSpiritAiInvocationResult = Readonly<{
  status: 'ready' | 'unavailable' | 'stale';
  result: string | null;
  summary: string;
  modelVersion: string;
  artifactHash: string;
  sourceHash: string;
  inputFingerprint: string;
  outputHash: string | null;
  createdAt: string;
  expiresAt: string;
  advisoryOnly: true;
  executable: false;
  mayCreateOrderIntent: false;
  cacheHit?: boolean;
  reasonCode?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

function rejectSecrets(value: unknown, depth = 0): void {
  if (depth > 8) throw new Error('AI invocation context nesting exceeds 8 levels.');
  if (Array.isArray(value)) {
    if (value.length > 512) throw new Error('AI invocation context arrays are limited to 512 items.');
    for (const item of value) rejectSecrets(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|secret|access[_-]?token|refresh[_-]?token|authorization|cookie|credential|api[_-]?key)/i.test(key)) {
      throw new Error('AI invocation context must not contain credentials or secret fields.');
    }
    rejectSecrets(child, depth + 1);
  }
}

export function parseCoreSpiritAiInvocationRequest(value: unknown): CoreSpiritAiInvocationRequest {
  if (!isRecord(value)) throw new Error('AI invocation request must be an object.');
  const source = typeof value.source === 'string' ? value.source : '';
  const artifactHash = typeof value.artifactHash === 'string' ? value.artifactHash.trim().toLowerCase() : '';
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  const context = value.context === undefined ? {} : value.context;
  const outputTokenLimit = value.outputTokenLimit === undefined
    ? CORE_SPIRIT_AI_INVOKE_LIMITS.defaultOutputTokens
    : Number(value.outputTokenLimit);
  if (!source || new TextEncoder().encode(source).byteLength > CORE_SPIRIT_AI_INVOKE_LIMITS.maxSourceBytes) {
    throw new Error('AI invocation source must contain 1–65,536 UTF-8 bytes.');
  }
  if (!/^[a-f0-9]{64}$/.test(artifactHash)) throw new Error('AI invocation requires a 64-character compiler artifact hash.');
  if (!prompt || prompt.length > CORE_SPIRIT_AI_INVOKE_LIMITS.maxPromptChars) {
    throw new Error('AI invocation prompt must contain 1–2,000 characters.');
  }
  if (/(?:password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|credential)\s*[:=]\s*\S+/i.test(prompt) || /Bearer\s+[A-Za-z0-9._~+\/-]{16,}/i.test(prompt)) {
    throw new Error('AI invocation prompt must not contain credentials or secret values.');
  }
  if (!isRecord(context)) throw new Error('AI invocation context must be a JSON object.');
  rejectSecrets(context);
  const canonicalContext = canonicalJson(context);
  if (new TextEncoder().encode(canonicalContext).byteLength > CORE_SPIRIT_AI_INVOKE_LIMITS.maxContextBytes) {
    throw new Error('AI invocation context exceeds 16 KiB.');
  }
  if (!Number.isSafeInteger(outputTokenLimit) || outputTokenLimit < 64 || outputTokenLimit > CORE_SPIRIT_AI_INVOKE_LIMITS.maxOutputTokens) {
    throw new Error('AI invocation outputTokenLimit must be an integer from 64 to 1,024.');
  }
  return Object.freeze({ source, artifactHash, prompt, context: JSON.parse(canonicalContext) as Record<string, unknown>, outputTokenLimit });
}

export function createCoreSpiritAiInputFingerprint(input: {
  source: string;
  artifactHash: string;
  prompt: string;
  context: Readonly<Record<string, unknown>>;
  modelVersion: string;
  outputTokenLimit: number;
}): string {
  return coreSpiritCopilotSha256({
    schemaVersion: 1,
    sourceHash: coreSpiritCopilotSha256(input.source),
    artifactHash: input.artifactHash,
    prompt: input.prompt,
    context: input.context,
    modelVersion: input.modelVersion,
    outputTokenLimit: input.outputTokenLimit,
  });
}

export function buildCoreSpiritAiInvocationResult(input: {
  status: 'ready' | 'unavailable' | 'stale';
  result?: string | null;
  summary: string;
  modelVersion: string;
  artifactHash: string;
  sourceHash: string;
  inputFingerprint: string;
  createdAt: string;
  reasonCode?: string;
  cacheHit?: boolean;
}): CoreSpiritAiInvocationResult {
  const result = input.result ?? null;
  return Object.freeze({
    status: input.status,
    result,
    summary: input.summary.slice(0, 2_000),
    modelVersion: input.modelVersion,
    artifactHash: input.artifactHash,
    sourceHash: input.sourceHash,
    inputFingerprint: input.inputFingerprint,
    outputHash: result === null ? null : coreSpiritCopilotSha256(result),
    createdAt: input.createdAt,
    expiresAt: new Date(Date.parse(input.createdAt) + CORE_SPIRIT_AI_INVOKE_LIMITS.resultFreshnessMs).toISOString(),
    advisoryOnly: true,
    executable: false,
    mayCreateOrderIntent: false,
    ...(input.cacheHit ? { cacheHit: true } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
  });
}
