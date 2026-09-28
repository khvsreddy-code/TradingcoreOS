export const CORE_SPIRIT_DEPLOYMENT_LIFECYCLE_VERSION = 1 as const;

export type CoreSpiritDeploymentState =
  | 'draft' | 'validated' | 'tested' | 'paper' | 'armed' | 'live' | 'paused' | 'retired';

const transitions: Record<CoreSpiritDeploymentState, readonly CoreSpiritDeploymentState[]> = {
  draft: ['validated', 'retired'],
  validated: ['tested', 'draft', 'retired'],
  tested: ['paper', 'draft', 'retired'],
  paper: ['armed', 'validated', 'paused', 'retired'],
  armed: ['live', 'paper', 'paused', 'retired'],
  live: ['paused', 'retired'],
  paused: ['paper', 'armed', 'live', 'retired'],
  retired: [],
};

export type CoreSpiritDeploymentTransition = Readonly<{
  from: CoreSpiritDeploymentState;
  to: CoreSpiritDeploymentState;
  at: string;
  actor: 'user' | 'system' | 'automation';
  reason?: string;
}>;

export function canTransitionCoreSpiritDeployment(from: CoreSpiritDeploymentState, to: CoreSpiritDeploymentState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionCoreSpiritDeployment(
  from: CoreSpiritDeploymentState,
  to: CoreSpiritDeploymentState,
  actor: CoreSpiritDeploymentTransition['actor'],
  reason?: string,
): CoreSpiritDeploymentTransition {
  if (!canTransitionCoreSpiritDeployment(from, to)) throw new Error(`Invalid CoreSpirit deployment transition: ${from} -> ${to}`);
  return Object.freeze({ from, to, at: new Date().toISOString(), actor, ...(reason ? { reason } : {}) });
}
