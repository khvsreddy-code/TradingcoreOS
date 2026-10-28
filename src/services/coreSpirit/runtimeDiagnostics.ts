/**
 * Stable diagnostic semantics at the CoreSpirit worker boundary.
 *
 * The runtime currently exposes legacy diagnostic strings from exception catches.
 * Convert only the known structured prefixes to stable codes. Unknown messages
 * fail closed instead of guessing severity from incidental words in the prose.
 */
export type CoreSpiritExecutionDiagnostic = Readonly<{
  severity: 'error' | 'warning';
  code: string;
  message: string;
  barIndex?: number;
  outputKind?: string;
}>;

export function structureCoreSpiritRuntimeDiagnostics(
  messages: readonly string[],
): CoreSpiritExecutionDiagnostic[] {
  return messages.map((raw): CoreSpiritExecutionDiagnostic => {
    const message = String(raw);
    const barError = message.match(/^bar (\d+):\s*(.*)$/s);
    if (barError) {
      return Object.freeze({
        severity: 'error',
        code: 'RUNTIME_BAR_EXECUTION',
        barIndex: Number(barError[1]),
        message: barError[2] || 'Runtime bar execution failed.',
      });
    }
    const outputError = message.match(/^output ([a-zA-Z][a-zA-Z0-9_-]*) at bar (\d+):\s*(.*)$/s);
    if (outputError) {
      return Object.freeze({
        severity: 'error',
        code: 'RUNTIME_OUTPUT_VALIDATION',
        outputKind: outputError[1],
        barIndex: Number(outputError[2]),
        message: outputError[3] || 'Runtime output validation failed.',
      });
    }
    return Object.freeze({
      severity: 'error',
      code: 'RUNTIME_DIAGNOSTIC_UNCLASSIFIED',
      message,
    });
  });
}
