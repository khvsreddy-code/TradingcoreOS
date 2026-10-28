import { createCoreSpiritSandbox, validateCoreScriptCapabilitiesAgainstSandbox, validateCoreSpiritSandboxArchitecture } from './capabilitySandbox';
import type { CoreSpiritIrProgram } from './ir';

export type CoreSpiritLifecycleStage =
  | 'editing' | 'compiling' | 'compiled' | 'validating-capabilities'
  | 'executing-historical' | 'validating-outputs' | 'applying-chart-output' | 'rendered'
  | 'compile-failed' | 'capability-denied' | 'execution-failed' | 'output-rejected'
  | 'rendering-failed' | 'stale' | 'hidden' | 'removed';

export type CoreSpiritLifecycleDiagnostic = Readonly<{
  severity: 'error' | 'warning' | 'info';
  stage: CoreSpiritLifecycleStage;
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  outputId?: string;
  expression?: string;
  suggestedCorrection?: string;
  previousOutputPreserved?: boolean;
}>;

export type CoreSpiritLifecycleEvent = Readonly<{
  stage: CoreSpiritLifecycleStage;
  scriptId?: string | null;
  scriptName?: string;
  sourceHash?: string;
  artifactHash?: string;
  chartId?: string;
  symbol?: string;
  timeframe?: string;
  outputRevision?: number;
  diagnostics?: readonly CoreSpiritLifecycleDiagnostic[];
  previousOutputPreserved?: boolean;
  message?: string;
  at: number;
}>;

export type CoreSpiritChartCompileDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  line?: number;
  column?: number;
  [key: string]: unknown;
};

export function validateCoreSpiritChartCapabilities(ir: CoreSpiritIrProgram | undefined): CoreSpiritChartCompileDiagnostic[] {
  const architecture = validateCoreSpiritSandboxArchitecture().map(message => ({
    severity: 'error' as const, message, code: 'CHART_SANDBOX_ARCHITECTURE',
  }));
  if (!ir) return architecture;
  const sandbox = createCoreSpiritSandbox({ layer: 'script', target: 'chart' });
  const denied = validateCoreScriptCapabilitiesAgainstSandbox(sandbox, ir.requiredCapabilities ?? []).map(message => ({
    severity: 'error' as const, message, code: 'CHART_CAPABILITY_DENIED',
  }));
  return [...architecture, ...denied];
}

export function coreSpiritLifecycleStageForError(error: unknown, fallback: CoreSpiritLifecycleStage = 'execution-failed'): CoreSpiritLifecycleStage {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof value.code === 'string' ? value.code : '';
  if (value.name === 'CoreSpiritCapabilityDeniedError' || code === 'CHART_CAPABILITY_DENIED') return 'capability-denied';
  if (code === 'CORESPIRIT_VELA_TIME_ALIGNMENT' || code === 'RUNTIME_OUTPUT_VALIDATION' || code === 'CORESPIRIT_OUTPUT_REJECTED') return 'output-rejected';
  if (fallback === 'applying-chart-output' || code === 'CORESPIRIT_RENDER_COMMIT_FAILED') return 'rendering-failed';
  if (fallback === 'compiling' || code === 'CORESPIRIT_COMPILE_FAILED') return 'compile-failed';
  return fallback === 'output-rejected' ? 'output-rejected' : fallback === 'capability-denied' ? 'capability-denied' : 'execution-failed';
}

export function coreSpiritLifecycleDiagnostic(
  error: unknown, stage: CoreSpiritLifecycleStage, options: { previousOutputPreserved?: boolean; outputId?: string; line?: number; column?: number } = {},
): CoreSpiritLifecycleDiagnostic {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown CoreSpirit error');
  const code = typeof value.code === 'string' ? value.code :
    stage === 'capability-denied' ? 'CHART_CAPABILITY_DENIED' :
    stage === 'output-rejected' ? 'CORESPIRIT_OUTPUT_REJECTED' :
    stage === 'rendering-failed' ? 'CORESPIRIT_RENDER_COMMIT_FAILED' :
    stage === 'compile-failed' ? 'CORESPIRIT_COMPILE_FAILED' : 'CORESPIRIT_EXECUTION_FAILED';
  let suggestedCorrection: string | undefined;
  if (code === 'CORESPIRIT_VELA_TIME_ALIGNMENT') suggestedCorrection = 'Align the output timestamp to a canonical chart bar; series output times must match the current chart timeline.';
  else if (code === 'CHART_CAPABILITY_DENIED' || value.name === 'CoreSpiritCapabilityDeniedError') suggestedCorrection = 'Remove the unsupported capability or run the script in an execution target that explicitly grants it.';
  else if (code === 'RUNTIME_OUTPUT_VALIDATION' || stage === 'output-rejected') suggestedCorrection = 'Inspect the output kind and offending value; emit only values that satisfy the CoreSpirit output contract.';
  else if (code === 'RUNTIME_BAR_EXECUTION' || stage === 'execution-failed') suggestedCorrection = 'Inspect the source expression and bar index, then reproduce the failure with the same historical dataset.';
  const details: CoreSpiritLifecycleDiagnostic = {
    severity: stage === 'rendered' ? 'info' : stage === 'editing' || stage === 'compiled' ? 'info' : 'error',
    stage, code, message: rawMessage,
    ...(Number.isInteger(options.line) ? { line: options.line } : {}),
    ...(Number.isInteger(options.column) ? { column: options.column } : {}),
    ...(options.outputId ? { outputId: options.outputId } : {}),
    ...(suggestedCorrection ? { suggestedCorrection } : {}),
    ...(options.previousOutputPreserved !== undefined ? { previousOutputPreserved: options.previousOutputPreserved } : {}),
  };
  return Object.freeze(details);
}

export function publishCoreSpiritLifecycle(event: Omit<CoreSpiritLifecycleEvent, 'at'> & { at?: number }): CoreSpiritLifecycleEvent {
  const snapshot: CoreSpiritLifecycleEvent = Object.freeze({ ...event, at: event.at ?? Date.now() });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CoreSpiritLifecycleEvent>('tco:corespirit:lifecycle', { detail: snapshot }));
  }
  return snapshot;
}

export const CORE_SPIRIT_LIFECYCLE_STEPS: readonly CoreSpiritLifecycleStage[] = Object.freeze([
  'editing', 'compiling', 'compiled', 'validating-capabilities', 'executing-historical', 'validating-outputs', 'applying-chart-output', 'rendered',
]);

export function coreSpiritLifecycleLabel(stage: CoreSpiritLifecycleStage): string {
  const labels: Record<CoreSpiritLifecycleStage, string> = {
    editing: 'Editing', compiling: 'Compiling', compiled: 'Compiled', 'validating-capabilities': 'Validating capabilities',
    'executing-historical': 'Executing historical data', 'validating-outputs': 'Validating outputs',
    'applying-chart-output': 'Applying chart output', rendered: 'Rendered', 'compile-failed': 'Compile failed',
    'capability-denied': 'Capability denied', 'execution-failed': 'Execution failed', 'output-rejected': 'Output rejected',
    'rendering-failed': 'Rendering failed', stale: 'Stale run ignored', hidden: 'Hidden', removed: 'Removed',
  };
  return labels[stage];
}
