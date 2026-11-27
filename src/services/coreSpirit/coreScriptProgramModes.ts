/**
 * CoreScript's four first-class program modes.
 *
 * This is a host policy contract, not an editor hint. The compiler may derive
 * a mode from the canonical program declaration, but the host must validate
 * the resulting mode against the execution target before granting capabilities.
 * No mode in this module can directly call a broker adapter.
 */
export type CoreScriptProgramMode = 'indicator' | 'strategy' | 'prediction' | 'automation';
export type CoreScriptExecutionTarget = 'chart' | 'simulator' | 'research' | 'automation-host' | 'live-broker';

export type CoreScriptModePermission =
  | 'market.calculate'
  | 'visual.draw'
  | 'model.infer'
  | 'model.train'
  | 'order-intent.simulated'
  | 'order-intent.risk-gated';

export type CoreScriptProgramModePolicy = Readonly<{
  mode: CoreScriptProgramMode;
  permissions: readonly CoreScriptModePermission[];
  defaultTarget: Exclude<CoreScriptExecutionTarget, 'live-broker'>;
  description: string;
}>;

const freezePolicy = (
  mode: CoreScriptProgramMode,
  permissions: CoreScriptModePermission[],
  defaultTarget: Exclude<CoreScriptExecutionTarget, 'live-broker'>,
  description: string,
): CoreScriptProgramModePolicy => Object.freeze({
  mode,
  permissions: Object.freeze([...permissions]),
  defaultTarget,
  description,
});

export const CORESCRIPT_PROGRAM_MODE_POLICIES: Readonly<Record<CoreScriptProgramMode, CoreScriptProgramModePolicy>> = Object.freeze({
  indicator: freezePolicy('indicator', ['market.calculate', 'visual.draw', 'model.infer'], 'chart',
    'Calculates and renders market studies. May consume approved model predictions but cannot train models or create order intents.'),
  strategy: freezePolicy('strategy', ['market.calculate', 'visual.draw', 'model.infer', 'order-intent.simulated'], 'simulator',
    'Calculates strategy logic and emits simulator-only order intents. It never receives live broker permissions.'),
  prediction: freezePolicy('prediction', ['market.calculate', 'visual.draw', 'model.infer', 'model.train'], 'research',
    'Builds features and trains/infers models. Prediction outputs are advisory and cannot create order intents.'),
  automation: freezePolicy('automation', ['market.calculate', 'visual.draw', 'model.infer', 'order-intent.risk-gated'], 'automation-host',
    'Runs event-driven workflows. Order intents require the independent host risk gate and broker execution policy.'),
});

export type CoreScriptModeValidationInput = Readonly<{
  mode: CoreScriptProgramMode;
  target: CoreScriptExecutionTarget;
  requestedPermissions?: readonly CoreScriptModePermission[];
  riskGateGranted?: boolean;
  liveExecutionApproved?: boolean;
}>;

export type CoreScriptModeDiagnostic = Readonly<{
  code: 'CORESCRIPT_MODE_UNKNOWN' | 'CORESCRIPT_MODE_PERMISSION_DENIED' | 'CORESCRIPT_MODE_TARGET_DENIED' |
    'CORESCRIPT_STRATEGY_LIVE_DENIED' | 'CORESCRIPT_AUTOMATION_RISK_GATE_REQUIRED' |
    'CORESCRIPT_PREDICTION_ORDER_DENIED' | 'CORESCRIPT_INDICATOR_ORDER_DENIED';
  severity: 'error';
  message: string;
}>;

const ALLOWED_TARGETS: Readonly<Record<CoreScriptProgramMode, readonly CoreScriptExecutionTarget[]>> = Object.freeze({
  indicator: Object.freeze(['chart', 'research']),
  strategy: Object.freeze(['simulator', 'research']),
  prediction: Object.freeze(['research', 'chart']),
  automation: Object.freeze(['automation-host', 'research']),
});

export function isCoreScriptProgramMode(value: unknown): value is CoreScriptProgramMode {
  return value === 'indicator' || value === 'strategy' || value === 'prediction' || value === 'automation';
}

export function getCoreScriptProgramModePolicy(mode: CoreScriptProgramMode): CoreScriptProgramModePolicy {
  return CORESCRIPT_PROGRAM_MODE_POLICIES[mode];
}

/**
 * Fail-closed validation at the host boundary. Requested permissions can only
 * narrow the mode policy; they can never expand it. The live-broker target is
 * intentionally absent from every mode's allow-list.
 */
export function validateCoreScriptProgramMode(input: CoreScriptModeValidationInput): readonly CoreScriptModeDiagnostic[] {
  const diagnostics: CoreScriptModeDiagnostic[] = [];
  const policy = CORESCRIPT_PROGRAM_MODE_POLICIES[input.mode];
  if (!policy) {
    return Object.freeze([{
      code: 'CORESCRIPT_MODE_UNKNOWN',
      severity: 'error',
      message: 'Unknown CoreScript program mode; execution is denied.',
    }]);
  }

  if (!ALLOWED_TARGETS[input.mode].includes(input.target)) {
    diagnostics.push({
      code: input.mode === 'strategy' && input.target === 'live-broker'
        ? 'CORESCRIPT_STRATEGY_LIVE_DENIED'
        : 'CORESCRIPT_MODE_TARGET_DENIED',
      severity: 'error',
      message: input.mode === 'strategy'
        ? 'Strategy programs are simulator-only. Live execution must be initiated by a separately authorized automation workflow.'
        : `Program mode '${input.mode}' cannot execute on target '${input.target}'.`,
    });
  }

  for (const permission of input.requestedPermissions ?? []) {
    if (!policy.permissions.includes(permission)) {
      const code = permission.startsWith('order-intent')
        ? input.mode === 'prediction' ? 'CORESCRIPT_PREDICTION_ORDER_DENIED'
          : input.mode === 'indicator' ? 'CORESCRIPT_INDICATOR_ORDER_DENIED'
          : 'CORESCRIPT_MODE_PERMISSION_DENIED'
        : 'CORESCRIPT_MODE_PERMISSION_DENIED';
      diagnostics.push({
        code,
        severity: 'error',
        message: `Program mode '${input.mode}' cannot request permission '${permission}'.`,
      });
    }
  }

  if (input.mode === 'automation' &&
      (input.requestedPermissions ?? []).includes('order-intent.risk-gated') &&
      input.riskGateGranted !== true) {
    diagnostics.push({
      code: 'CORESCRIPT_AUTOMATION_RISK_GATE_REQUIRED',
      severity: 'error',
      message: 'Automation order intents require an affirmative host risk-gate decision for this execution.',
    });
  }

  // This flag is deliberately not an authorization shortcut. Even an approved
  // live session cannot make a strategy program a broker-capable program.
  void input.liveExecutionApproved;
  return Object.freeze(diagnostics.map(item => Object.freeze(item)));
}

/** Convenience predicate for hosts that must stop before allocating a runtime. */
export function canExecuteCoreScriptProgramMode(input: CoreScriptModeValidationInput): boolean {
  return validateCoreScriptProgramMode(input).length === 0;
}
