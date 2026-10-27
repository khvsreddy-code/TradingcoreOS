/**
 * Convert runtime snapshots into plain structured-cloneable data at the worker boundary.
 *
 * Runtime fast paths intentionally keep proxy-backed series views and may contain
 * host functions/classes in extension metadata. Those are valid inside the VM but
 * cannot cross Worker.postMessage. Preserve data, strip executable values, and
 * copy objects into plain records before crossing the realm boundary.
 */
export function toCoreSpiritWorkerTransportValue(value: unknown): unknown {
  const seen = new WeakMap<object, unknown>();

  const visit = (input: unknown): unknown => {
    if (input === null || input === undefined) return input;
    const kind = typeof input;
    if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') return input;
    if (kind === 'function' || kind === 'symbol') return undefined;
    if (kind !== 'object') return undefined;

    try {
      const object = input as object;
      const prior = seen.get(object);
      if (prior !== undefined) return prior;

      if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
      if (input instanceof ArrayBuffer) return input.slice(0);
      if (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer) return input;
      if (ArrayBuffer.isView(input)) {
        // Typed arrays and DataView are structured-cloneable, but copying prevents
        // a consumer from observing later mutation of VM-owned backing memory.
        if (input instanceof DataView) {
          const buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
          return new DataView(buffer);
        }
        const view = input as unknown as { slice?: () => unknown };
        return typeof view.slice === 'function' ? view.slice() : Array.from(input as unknown as ArrayLike<unknown>, visit);
      }

      if (input instanceof Map) {
        const output = new Map<unknown, unknown>();
        seen.set(object, output);
        for (const [key, entry] of input) {
          const safeKey = visit(key);
          const safeEntry = visit(entry);
          if (safeKey !== undefined && safeEntry !== undefined) output.set(safeKey, safeEntry);
        }
        return output;
      }
      if (input instanceof Set) {
        const output = new Set<unknown>();
        seen.set(object, output);
        for (const entry of input) {
          const safeEntry = visit(entry);
          if (safeEntry !== undefined) output.add(safeEntry);
        }
        return output;
      }
      if (input instanceof WeakMap || input instanceof WeakSet || input instanceof Promise) return undefined;

      if (Array.isArray(input)) {
        const output: unknown[] = [];
        seen.set(object, output);
        for (const entry of input) output.push(visit(entry));
        return output;
      }

      // Do not transfer a class instance's prototype or methods. Copy only its
      // enumerable data contract; this also removes proxies from ordinary snapshots.
      const output: Record<string, unknown> = {};
      seen.set(object, output);
      for (const key of Object.keys(input)) {
        let entry: unknown;
        try { entry = (input as Record<string, unknown>)[key]; }
        catch { continue; }
        const safeEntry = visit(entry);
        if (safeEntry !== undefined) output[key] = safeEntry;
      }
      return output;
    } catch {
      // A revoked proxy or exotic host object must not poison every chart run.
      return undefined;
    }
  };

  return visit(value);
}
