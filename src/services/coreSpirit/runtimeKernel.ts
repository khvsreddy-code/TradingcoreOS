/**
 * CoreSpirit shared runtime kernel — Stage 48.
 *
 * One orchestration kernel serves Script, Model, Strategy and Automation.
 * The layer controls which capabilities are legal; the execution substrate
 * (series, indicators, IR/VM, scenes and events) stays shared.
 */

import {
  CORE_SPIRIT_LAYER_PROFILES,
  type CoreSpiritCapability,
  type CoreSpiritProgramLayer,
  canUseCapability,
} from './layeredPlatformContract';
import type { CoreSpiritExecutionMode } from './types';
import { CoreSpiritModelRegistry } from './modelAbi';
import { createCoreSpiritSandbox, type CoreSpiritCapabilitySandbox } from './capabilitySandbox';

export type CoreSpiritRuntimePlane =
  | 'data'
  | 'compute'
  | 'visual'
  | 'event'
  | 'risk'
  | 'execution';

export interface CoreSpiritRuntimeIdentity {
  runId: string;
  programId: string;
  programChecksum: string;
  layer: CoreSpiritProgramLayer;
  mode: CoreSpiritExecutionMode;
}

export interface CoreSpiritRuntimeBudget {
  maxInstructionsPerBar: number;
  maxOutputsPerBar: number;
  maxVisualNodes: number;
  maxModelCallsPerBar: number;
}

export interface CoreSpiritRuntimeServices {
  /** Shared data/series service owned by the host runtime. */
  data: { readonly id: string };
  /** Shared IR/VM execution service. */
  compute: { readonly id: string };
  /** Renderer-neutral scene service. */
  visual: { readonly id: string };
  /** Immutable event publication service. */
  event: { readonly id: string };
  /** Risk-policy service. */
  risk: { readonly id: string };
  /** Broker/execution service, never directly exposed to CoreSpirit. */
  execution: { readonly id: string };
}

export interface CoreSpiritRuntimeKernelOptions {
  identity: CoreSpiritRuntimeIdentity;
  budget: CoreSpiritRuntimeBudget;
  services: CoreSpiritRuntimeServices;
  modelRegistry?: CoreSpiritModelRegistry;
  sandbox?: CoreSpiritCapabilitySandbox;
}

export class CoreSpiritCapabilityError extends Error {
  constructor(
    public readonly layer: CoreSpiritProgramLayer,
    public readonly capability: CoreSpiritCapability,
  ) {
    super(`CoreSpirit layer '${layer}' cannot use capability '${capability}'`);
    this.name = 'CoreSpiritCapabilityError';
  }
}

export class CoreSpiritRuntimeKernel {
  readonly identity: CoreSpiritRuntimeIdentity;
  readonly budget: CoreSpiritRuntimeBudget;
  readonly services: CoreSpiritRuntimeServices;
  readonly modelRegistry: CoreSpiritModelRegistry;
  readonly sandbox: CoreSpiritCapabilitySandbox;

  constructor(options: CoreSpiritRuntimeKernelOptions) {
    this.identity = { ...options.identity };
    this.budget = { ...options.budget };
    this.services = options.services;
    this.sandbox = options.sandbox ?? createCoreSpiritSandbox({ layer: options.identity.layer, target: options.identity.mode === 'historical' ? 'chart' : options.identity.mode === 'realtime' ? 'chart' : options.identity.mode === 'replay' ? 'replay' : 'backtest' });
    this.modelRegistry = options.modelRegistry ?? new CoreSpiritModelRegistry();
    this.validateArchitecture();
  }

  can(capability: CoreSpiritCapability): boolean {
    return canUseCapability(this.identity.layer, capability);
  }

  require(capability: CoreSpiritCapability): void {
    if (!this.can(capability)) throw new CoreSpiritCapabilityError(this.identity.layer, capability);
  }

  getAllowedCapabilities(): readonly CoreSpiritCapability[] {
    return CORE_SPIRIT_LAYER_PROFILES[this.identity.layer].capabilities;
  }

  private validateArchitecture(): void {
    if (!this.identity.runId || !this.identity.programId || !this.identity.programChecksum) {
      throw new Error('runtime identity must contain runId, programId and programChecksum');
    }
    if (this.budget.maxInstructionsPerBar < 1 || this.budget.maxOutputsPerBar < 1) {
      throw new Error('runtime budgets must be positive');
    }
    if (this.budget.maxVisualNodes < 0 || this.budget.maxModelCallsPerBar < 0) {
      throw new Error('runtime visual/model budgets cannot be negative');
    }

    // Execution is a host capability, never a language-layer capability.
    if (this.getAllowedCapabilities().includes('order-intents') && this.identity.layer !== 'automation') {
      throw new Error('order-intents are only legal in the automation layer');
    }
  }
}
