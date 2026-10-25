import { createHash } from 'node:crypto';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION.js';

export type CoreSpiritGeneratedBacktestScenario = Readonly<{
  name: string;
  setup: string;
  expected: string;
}>;

export type CoreSpiritGeneratedCopilotOutput = Readonly<{
  source: string;
  summary: string;
  assumptions: readonly string[];
  tests: readonly string[];
  backtestScenarios: readonly CoreSpiritGeneratedBacktestScenario[];
}>;

export type CoreSpiritCopilotDraftIdentityInput = Readonly<{
  source: string;
  baseSource: string;
  prompt: string;
  mode: string;
  model: string;
  symbol?: string;
  timeframe?: string;
  diagnostics: readonly unknown[];
  tests: readonly string[];
  backtestScenarios: readonly CoreSpiritGeneratedBacktestScenario[];
  compiledArtifactHash: string | null;
  repairAttempts: number;
  createdAt: string;
  analysisOnly?: boolean;
  knowledgeVersion?: string;
  knowledgeHitIds?: readonly string[];
}>;

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

export function coreSpiritCopilotSha256(value: string | unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}

/**
 * Produce a bounded, review-only unified diff. This is display metadata, not an
 * executable patch and is deliberately never applied to source by this helper.
 */
export function buildCoreSpiritReviewPatch(baseSource: string, nextSource: string, maxLines = 240): string {
  const before = baseSource.replace(/\r\n/g, '\n').split('\n');
  const after = nextSource.replace(/\r\n/g, '\n').split('\n');
  if (before.length === after.length && before.every((line, index) => line === after[index])) return 'No source changes.';
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const context = 3;
  const start = Math.max(0, prefix - context);
  const oldChangedEnd = before.length - suffix;
  const newChangedEnd = after.length - suffix;
  const oldStart = start;
  const newStart = start;
  const oldLines = before.slice(start, Math.min(before.length, oldChangedEnd + context));
  const newLines = after.slice(start, Math.min(after.length, newChangedEnd + context));
  const oldLineCount = oldLines.length;
  const newLineCount = newLines.length;
  const content = [
    ...before.slice(start, prefix).map(line => ' ' + line),
    ...before.slice(prefix, oldChangedEnd).map(line => '-' + line),
    ...after.slice(prefix, newChangedEnd).map(line => '+' + line),
    ...before.slice(oldChangedEnd, Math.min(before.length, oldChangedEnd + context)).map(line => ' ' + line),
  ];
  const clipped = content.length > maxLines
    ? [...content.slice(0, maxLines), '… diff truncated; review the full candidate source before applying']
    : content;
  return [
    '--- a/CoreScript',
    '+++ b/CoreScript',
    '@@ -' + (oldStart + 1) + ',' + oldLineCount + ' +' + (newStart + 1) + ',' + newLineCount + ' @@',
    ...clipped,
  ].join('\n');
}

export function buildCoreSpiritCopilotDraftArtifact(input: CoreSpiritCopilotDraftIdentityInput) {
  const sourceHash = coreSpiritCopilotSha256(input.source);
  const baseSourceHash = coreSpiritCopilotSha256(input.baseSource);
  const promptHash = coreSpiritCopilotSha256(input.prompt);
  const diagnosticsHash = coreSpiritCopilotSha256(input.diagnostics);
  const testsHash = coreSpiritCopilotSha256(input.tests);
  const scenariosHash = coreSpiritCopilotSha256(input.backtestScenarios);
  const identity = {
    schemaVersion: 1,
    sourceHash,
    baseSourceHash,
    promptHash,
    mode: input.mode,
    model: input.model,
    symbol: input.symbol ?? '',
    timeframe: input.timeframe ?? '',
    compilerVersion: CORE_SPIRIT_COMPILER_VERSION,
    runtimeVersion: CORE_SPIRIT_RUNTIME_VERSION,
    diagnosticsHash,
    knowledgeVersion: input.knowledgeVersion ?? 'not-recorded',
    knowledgeHitIds: [...(input.knowledgeHitIds ?? [])].slice(0, 12),
    testsHash,
    backtestScenariosHash: scenariosHash,
    compiledArtifactHash: input.compiledArtifactHash,
    repairAttempts: input.repairAttempts,
    analysisOnly: input.analysisOnly === true,
    createdAt: input.createdAt,
  };
  return Object.freeze({
    kind: input.analysisOnly ? 'corespirit-copilot-report' as const : 'corespirit-copilot-draft' as const,
    schemaVersion: 1 as const,
    version: 1,
    artifactHash: coreSpiritCopilotSha256(identity),
    ...identity,
    executable: false as const,
    requiresExplicitApply: !input.analysisOnly,
    requiresIndependentCompileAndCapabilityChecks: true as const,
    requiresRiskGatesBeforeAnyOrderIntent: true as const,
  });
}
