/**
 * CoreSpirit Model Runtime Gateway — Stage 50.
 *
 * Turns a validated MODEL_CALL into a deterministic, quota-limited model
 * execution. The VM sees a host capability, never a network socket.
 */

import {
  CoreSpiritModelRegistry,
  type CoreSpiritModelExecutionContext,
  type CoreSpiritModelExecutionResult,
  type CoreSpiritModelTensor,
} from "./modelAbi";
import { coreSpiritChecksum } from "./artifact";

export interface CoreSpiritModelCall {
  modelId: string;
  version: string;
  context: CoreSpiritModelExecutionContext;
  inputs: Readonly<Record<string, CoreSpiritModelTensor>>;
  stateToken?: string;
}

export interface CoreSpiritModelCallLimits {
  maxCallsPerBar: number;
  maxInputBytes: number;
  maxOutputBytes: number;
}

export interface CoreSpiritModelCallResult extends CoreSpiritModelExecutionResult {
  modelId: string;
  version: string;
  requestChecksum: string;
}

function tensorByteSize(tensor: CoreSpiritModelTensor): number {
  const itemSize = tensor.dtype === "f64" ? 8 : tensor.dtype === "i64" ? 8 : 1;
  return itemSize * tensor.data.length;
}

function validateTensor(name: string, tensor: CoreSpiritModelTensor): void {
  if (!Array.isArray(tensor.shape) || tensor.shape.some(v => !Number.isInteger(v) || v < 0)) {
    throw new Error(`invalid tensor shape for '${name}'`);
  }
  const expected = tensor.shape.reduce((acc, n) => acc * n, 1);
  if (expected !== tensor.data.length) {
    throw new Error(`tensor '${name}' data length does not match shape`);
  }
  if (tensor.data.some(v => typeof v !== "number" || !Number.isFinite(v))) {
    throw new Error(`tensor '${name}' contains a non-finite value`);
  }
}

function totalTensorBytes(tensors: Readonly<Record<string, CoreSpiritModelTensor>>): number {
  return Object.values(tensors).reduce((sum, tensor) => sum + tensorByteSize(tensor), 0);
}

export class CoreSpiritModelRuntime {
  private callsThisBar = 0;
  private currentBar = -1;

  constructor(
    private readonly registry: CoreSpiritModelRegistry,
    private readonly limits: CoreSpiritModelCallLimits,
  ) {}

  beginBar(barIndex: number): void {
    if (barIndex !== this.currentBar) {
      this.currentBar = barIndex;
      this.callsThisBar = 0;
    }
  }

  async execute(call: CoreSpiritModelCall): Promise<CoreSpiritModelCallResult> {
    this.beginBar(call.context.barIndex);

    if (this.callsThisBar >= this.limits.maxCallsPerBar) {
      throw new Error(`CoreSpirit model call quota exceeded at bar ${call.context.barIndex}`);
    }

    const registered = this.registry.get(call.modelId, call.version);

    for (const [name, tensor] of Object.entries(call.inputs)) validateTensor(name, tensor);

    const inputBytes = totalTensorBytes(call.inputs);
    if (inputBytes > this.limits.maxInputBytes) {
      throw new Error(`CoreSpirit model input quota exceeded: ${inputBytes} bytes`);
    }

    const manifest = registered.manifest;
    const missing = manifest.inputNames.filter(name => !(name in call.inputs));
    if (missing.length) {
      throw new Error(`model '${call.modelId}@${call.version}' missing inputs: ${missing.join(", ")}`);
    }

    const request = {
      context: { ...call.context },
      inputs: call.inputs,
      stateToken: call.stateToken,
    };

    const requestChecksum = coreSpiritChecksum({
      modelId: call.modelId,
      version: call.version,
      context: request.context,
      inputs: request.inputs,
      stateToken: request.stateToken ?? "",
    });

    const result = await registered.host.execute(manifest, request);
    this.validateOutputs(manifest.outputNames, result.outputs);

    const outputBytes = totalTensorBytes(result.outputs);
    if (outputBytes > this.limits.maxOutputBytes) {
      throw new Error(`CoreSpirit model output quota exceeded: ${outputBytes} bytes`);
    }

    this.callsThisBar += 1;

    return {
      ...result,
      modelId: call.modelId,
      version: call.version,
      requestChecksum,
    };
  }

  private validateOutputs(
    expectedNames: readonly string[],
    outputs: Readonly<Record<string, CoreSpiritModelTensor>>,
  ): void {
    for (const name of expectedNames) {
      if (!(name in outputs)) throw new Error(`model output '${name}' is missing`);
      validateTensor(name, outputs[name]);
    }
  }
}
