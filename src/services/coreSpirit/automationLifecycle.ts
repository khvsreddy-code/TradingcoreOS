/**
 * Authoritative automation lifecycle — every automation has an explicit state.
 *
 * CREATED -> VALIDATED -> PAPER -> ARMED -> LIVE -> PAUSED -> STOPPED
 *
 * The lifecycle is a control-plane contract. Runtime execution may never infer
 * "live" from a boolean or a UI toggle; the explicit LIVE state is required.
 */

export const CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION = 1 as const;

export type CoreSpiritAutomationLifecycleState =
  | 'CREATED'
  | 'VALIDATED'
  | 'PAPER'
  | 'ARMED'
  | 'LIVE'
  | 'PAUSED'
  | 'STOPPED';

export type CoreSpiritAutomationLifecycleActor = 'user' | 'policy' | 'system';

export type CoreSpiritAutomationLifecycleTransition =
  | 'VALIDATE'
  | 'ENTER_PAPER'
  | 'ARM'
  | 'ACTIVATE_LIVE'
  | 'PAUSE'
  | 'STOP'
  | 'RESUME_ARMED'
  | 'RESUME_PAPER';

export interface CoreSpiritAutomationLifecycleRecord {
  version: typeof CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION;
  automationId: string;
  state: CoreSpiritAutomationLifecycleState;
  actor: CoreSpiritAutomationLifecycleActor;
  reason: string;
  transitionId: string;
  timestamp: number;
}

export interface CoreSpiritAutomationLifecycleSnapshot {
  automationId: string;
  state: CoreSpiritAutomationLifecycleState;
  version: typeof CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION;
  updatedAt: number;
  history: readonly CoreSpiritAutomationLifecycleRecord[];
}

export type CoreSpiritAutomationLifecycleCapability =
  | 'validate'
  | 'evaluate'
  | 'create-order-intent'
  | 'paper-execute'
  | 'live-execute'
  | 'pause'
  | 'stop'
  | 'resume';

const CAPABILITIES: Readonly<Record<CoreSpiritAutomationLifecycleState, readonly CoreSpiritAutomationLifecycleCapability[]>> = {
  CREATED: ['validate', 'stop'],
  VALIDATED: ['evaluate', 'stop'],
  PAPER: ['evaluate', 'create-order-intent', 'paper-execute', 'pause', 'stop'],
  ARMED: ['evaluate', 'create-order-intent', 'paper-execute', 'pause', 'stop'],
  LIVE: ['evaluate', 'create-order-intent', 'paper-execute', 'live-execute', 'pause', 'stop'],
  PAUSED: ['resume', 'stop'],
  STOPPED: [],
};

export function canAutomationUseCapability(
  state: CoreSpiritAutomationLifecycleState,
  capability: CoreSpiritAutomationLifecycleCapability | 'resume',
): boolean {
  return (CAPABILITIES[state] as readonly string[]).includes(capability);
}

const ALLOWED: Readonly<Record<CoreSpiritAutomationLifecycleState, readonly CoreSpiritAutomationLifecycleTransition[]>> = {
  CREATED: ['VALIDATE', 'STOP'],
  VALIDATED: ['ENTER_PAPER', 'ARM', 'STOP'],
  PAPER: ['ARM', 'PAUSE', 'STOP'],
  ARMED: ['ACTIVATE_LIVE', 'ENTER_PAPER', 'PAUSE', 'STOP'],
  LIVE: ['PAUSE', 'STOP'],
  PAUSED: ['RESUME_ARMED', 'RESUME_PAPER', 'STOP'],
  STOPPED: [],
};

const DESTINATION: Readonly<Record<CoreSpiritAutomationLifecycleTransition, CoreSpiritAutomationLifecycleState>> = {
  VALIDATE: 'VALIDATED',
  ENTER_PAPER: 'PAPER',
  ARM: 'ARMED',
  ACTIVATE_LIVE: 'LIVE',
  PAUSE: 'PAUSED',
  STOP: 'STOPPED',
  RESUME_ARMED: 'ARMED',
  RESUME_PAPER: 'PAPER',
};

export function canTransitionAutomationLifecycle(
  state: CoreSpiritAutomationLifecycleState,
  transition: CoreSpiritAutomationLifecycleTransition,
): boolean {
  return ALLOWED[state].includes(transition);
}

export function isAutomationExecutionEnabled(
  state: CoreSpiritAutomationLifecycleState,
): boolean {
  return state === 'PAPER' || state === 'ARMED' || state === 'LIVE';
}

export function isAutomationLive(
  state: CoreSpiritAutomationLifecycleState,
): boolean {
  return state === 'LIVE';
}

export function createAutomationLifecycle(
  automationId: string,
  now = Date.now(),
): CoreSpiritAutomationLifecycleSnapshot {
  return {
    automationId,
    state: 'CREATED',
    version: CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION,
    updatedAt: now,
    history: [],
  };
}

export function transitionAutomationLifecycle(
  snapshot: CoreSpiritAutomationLifecycleSnapshot,
  transition: CoreSpiritAutomationLifecycleTransition,
  actor: CoreSpiritAutomationLifecycleActor,
  reason: string,
  now = Date.now(),
): CoreSpiritAutomationLifecycleSnapshot {
  if (!canTransitionAutomationLifecycle(snapshot.state, transition)) {
    throw new Error(
      `automation ${snapshot.automationId} cannot transition ${snapshot.state} -> ${transition}`,
    );
  }
  if (transition === 'ACTIVATE_LIVE' && actor === 'system') {
    throw new Error('LIVE activation requires an explicit user or policy actor');
  }

  const state = DESTINATION[transition];
  const record: CoreSpiritAutomationLifecycleRecord = {
    version: CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION,
    automationId: snapshot.automationId,
    state,
    actor,
    reason,
    transitionId: `${snapshot.automationId}:${transition}:${now}`,
    timestamp: now,
  };

  return {
    ...snapshot,
    state,
    updatedAt: now,
    history: [...snapshot.history, record],
  };
}

export function validateAutomationLifecycleSnapshot(
  snapshot: CoreSpiritAutomationLifecycleSnapshot,
): string[] {
  const errors: string[] = [];
  if (!snapshot.automationId) errors.push('automationId is required');
  if (snapshot.version !== CORE_SPIRIT_AUTOMATION_LIFECYCLE_VERSION) errors.push('unsupported lifecycle version');
  if (!Number.isFinite(snapshot.updatedAt) || snapshot.updatedAt <= 0) errors.push('updatedAt must be a positive timestamp');
  for (const record of snapshot.history) {
    if (record.automationId !== snapshot.automationId) errors.push('lifecycle history contains another automationId');
    if (record.transitionId.length === 0) errors.push('lifecycle transitionId cannot be empty');
    if (record.state === 'LIVE' && record.actor === 'system') errors.push('LIVE state cannot be activated by system actor');
  }
  if (snapshot.state === 'STOPPED' && snapshot.history.length > 0 && snapshot.history.at(-1)?.state !== 'STOPPED') {
    errors.push('STOPPED snapshot must end with a STOPPED transition');
  }
  return errors;
}
