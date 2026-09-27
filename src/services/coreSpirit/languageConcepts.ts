/**
 * CoreSpirit v1 user mental model.
 *
 * The platform has many implementation capabilities, but the source language is
 * organized around six semantic concepts. These are deliberately not six new
 * parser productions: surface syntax and callable contracts converge into the
 * existing parser/AST/IR/VM pipeline.
 */

export const CORE_SPIRIT_LANGUAGE_CONCEPTS = Object.freeze([
  'DATA',
  'LET',
  'WHEN',
  'SHOW',
  'MODEL',
  'AUTOMATE',
] as const);

export type CoreSpiritLanguageConcept = typeof CORE_SPIRIT_LANGUAGE_CONCEPTS[number];

export type CoreSpiritModelSurfaceBinding = {
  kind: 'registry' | 'python' | 'cpp' | 'rust' | 'wasm' | 'onnx' | 'remote';
  locator: string;
};

export type CoreSpiritModelSurfaceFieldType = 'unknown' | 'number' | 'string' | 'boolean' | 'series<number>';

export type CoreSpiritEventDestination =
  | { kind: 'webhook'; target: string }
  | { kind: 'automation'; target: string }
  | { kind: 'notification'; target?: string }
  | { kind: 'alert'; target?: string };

export type CoreSpiritEventRoute = {
  eventName: string;
  destinations: CoreSpiritEventDestination[];
  start: number;
  end: number;
};

export type CoreSpiritSurfaceDeclaration =
  | {
      kind: 'indicator';
      name: string;
      start: number;
      end: number;
    }
  | {
      kind: 'model';
      name: string;
      binding?: CoreSpiritModelSurfaceBinding;
      inputs: string[];
      outputs: string[];
      inputTypes: Record<string, CoreSpiritModelSurfaceFieldType>;
      outputTypes: Record<string, CoreSpiritModelSurfaceFieldType>;
      /** Compatibility aliases for the earlier feature/predict vocabulary. */
      features: string[];
      predictions: string[];
      start: number;
      end: number;
    }
  | {
      kind: 'automation';
      name: string;
      triggers: string[];
      start: number;
      end: number;
    };

export type CoreSpiritCompositionMetadata = {
  version: 2;
  sourceGraphVersion?: 1;
  nodes: ReadonlyArray<{ id: string; kind: string; name: string; contract: string }>;
  edges: ReadonlyArray<{ from: string; to: string; relation: string }>;
};

export type CoreSpiritSurfaceMetadata = {
  version: 1;
  primaryConcept: CoreSpiritLanguageConcept | 'mixed';
  concepts: CoreSpiritLanguageConcept[];
  declarations: CoreSpiritSurfaceDeclaration[];
  eventRoutes?: CoreSpiritEventRoute[];
  composition?: CoreSpiritCompositionMetadata;
};

/**
 * Classification is intentionally semantic. A builtin such as plot() is still
 * an implementation callable; to the user it belongs to SHOW.
 */
const DATA_NAMES = new Set([
  'open','high','low','close','volume','time',
  'market','timeframe','request','requestBatch','lowerTf',
  'bid','ask','spread','mid',
  'intrabarCount','intrabarSum','intrabarHigh','intrabarLow','intrabarDelta',
  'depthImbalance','footprintDelta','footprintBuy','footprintSell',
  'footprintPoc','footprintVah','footprintVal','footprintRows',
]);

const SHOW_NAMES = new Set([
  'show','plot','marker','label','labelAt','line','zone','box','band','fill',
  'gradient','arrow','shape','heatmap','polyline','hline','bg',
  'barcolor','table','text','polygon','customVisual',
]);

const AUTOMATE_NAMES = new Set([
  'order','entry','exit','buy','sell','alert','webhook',
]);

const MODEL_NAMES = new Set([
  'predict','score','probability',
]);

export function classifyCoreSpiritIdentifier(name: string): CoreSpiritLanguageConcept | undefined {
  if (DATA_NAMES.has(name)) return 'DATA';
  if (SHOW_NAMES.has(name)) return 'SHOW';
  if (AUTOMATE_NAMES.has(name)) return 'AUTOMATE';
  if (MODEL_NAMES.has(name)) return 'MODEL';
  return undefined;
}

export function makeCoreSpiritSurfaceMetadata(
  concepts: Iterable<CoreSpiritLanguageConcept>,
  declarations: CoreSpiritSurfaceDeclaration[] = [],
  eventRoutes: CoreSpiritEventRoute[] = [],
): CoreSpiritSurfaceMetadata {
  const ordered = CORE_SPIRIT_LANGUAGE_CONCEPTS.filter(concept => Array.from(concepts).includes(concept));
  const unique = [...new Set(ordered)];
  const primaryConcept = unique.length === 1 ? unique[0] : unique.length ? 'mixed' : 'LET';
  return {
    version: 1,
    primaryConcept,
    concepts: unique,
    declarations: declarations.map(declaration => ({
      ...declaration,
      ...(declaration.kind === 'model' ? {
        ...(declaration.binding ? { binding: { ...declaration.binding } } : {}),
        inputs: [...declaration.inputs],
        outputs: [...declaration.outputs],
        inputTypes: { ...declaration.inputTypes },
        outputTypes: { ...declaration.outputTypes },
        features: [...declaration.features],
        predictions: [...declaration.predictions],
      } : declaration.kind === 'automation' ? {
        triggers: [...declaration.triggers],
      } : {}),
    })),
    ...(eventRoutes.length ? {
      eventRoutes: eventRoutes.map(route => ({
        ...route,
        destinations: route.destinations.map(destination => ({ ...destination })),
      })),
    } : {}),
  };
}

function lineIndent(raw: string): number {
  return raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
}

function parseModelField(value: string): { name: string; type: CoreSpiritModelSurfaceFieldType } | undefined {
  const match = value.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(number|string|boolean|series<number>))?$/i);
  if (!match) return undefined;
  return {
    name: match[1],
    type: (match[2]?.toLowerCase() ?? 'unknown') as CoreSpiritModelSurfaceFieldType,
  };
}

function bareModelName(value: string): boolean {
  return Boolean(parseModelField(value));
}

/**
 * Extract user-facing declarations before normalization. This metadata is not a
 * second AST; it is stable intent attached to the same executable IR artifact.
 */
export function extractCoreSpiritSurfaceMetadata(source: string): CoreSpiritSurfaceMetadata {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const declarations: CoreSpiritSurfaceDeclaration[] = [];
  const concepts = new Set<CoreSpiritLanguageConcept>();

  type Active =
    | { kind: 'model'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'model' }; indent: number; modelSection?: 'input' | 'output' }
    | { kind: 'automation'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'automation' }; indent: number }
    | { kind: 'indicator'; declaration: CoreSpiritSurfaceDeclaration & { kind: 'indicator' }; indent: number };

  const active: Active[] = [];

  const finishToIndent = (indent: number, offset: number) => {
    while (active.length && indent <= active[active.length - 1].indent) {
      const item = active.pop()!;
      item.declaration.end = Math.max(item.declaration.start, offset);
      declarations.push(item.declaration);
    }
  };

  let offset = 0;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = lineIndent(raw);
    // Blank/comment lines never close an indentation-based declaration.
    if (!trimmed || trimmed.startsWith('//')) {
      offset += raw.length + 1;
      continue;
    }

    const model = trimmed.match(/^model\s+(?:"([^"]+)"|'([^']+)')\s*:\s*$/i);
    if (model) {
      concepts.add('MODEL');
      const name = model[1] ?? model[2] ?? 'Model';
      const declaration = {
        kind: 'model' as const,
        name,
        binding: undefined as CoreSpiritModelSurfaceBinding | undefined,
        inputs: [] as string[],
        outputs: [] as string[],
        inputTypes: {} as Record<string, CoreSpiritModelSurfaceFieldType>,
        outputTypes: {} as Record<string, CoreSpiritModelSurfaceFieldType>,
        features: [] as string[],
        predictions: [] as string[],
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'model', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    const automate = trimmed.match(/^automate\s+(?:"([^"]+)"|'([^']+)')\s*:\s*$/i);
    if (automate) {
      concepts.add('AUTOMATE');
      const name = automate[1] ?? automate[2] ?? 'Automation';
      const declaration = {
        kind: 'automation' as const,
        name,
        triggers: [],
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'automation', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    const indicator = trimmed.match(/^indicator\s+(?:"([^"]+)"|'([^']+)')\s*:\s*$/i);
    if (indicator) {
      const name = indicator[1] ?? indicator[2] ?? 'Indicator';
      const declaration = {
        kind: 'indicator' as const,
        name,
        start: offset,
        end: offset + raw.length,
      };
      active.push({ kind: 'indicator', declaration, indent });
      offset += raw.length + 1;
      continue;
    }

    if (active.length) {
      const current = active[active.length - 1];
      if (current.kind === 'model') {
        const field = current.modelSection ? parseModelField(trimmed) : undefined;
        if (field) {
          if (current.modelSection === 'input') {
            if (!current.declaration.inputs.includes(field.name)) current.declaration.inputs.push(field.name);
            current.declaration.inputTypes[field.name] = field.type;
            if (!current.declaration.features.includes(field.name)) current.declaration.features.push(field.name);
          } else {
            if (!current.declaration.outputs.includes(field.name)) current.declaration.outputs.push(field.name);
            current.declaration.outputTypes[field.name] = field.type;
            if (!current.declaration.predictions.includes(field.name)) current.declaration.predictions.push(field.name);
          }
          concepts.add('MODEL');
          offset += raw.length + 1;
          continue;
        }
        if (/^input(?:s)?\s*:\s*$/i.test(trimmed)) { current.modelSection = 'input'; offset += raw.length + 1; continue; }
        if (/^output(?:s)?\s*:\s*$/i.test(trimmed)) { current.modelSection = 'output'; offset += raw.length + 1; continue; }
        const useRegistry = trimmed.match(/^use\s+(?:"([^"]+)"|'([^']+)')\s*$/i);
        const useExternal = trimmed.match(/^use\s+(python|cpp|rust|wasm|onnx|remote)\s+(?:"([^"]+)"|'([^']+)')\s*$/i);
        const inputLine = trimmed.match(/^input(?:s)?\s*:\s*(.*)$/i);
        const outputLine = trimmed.match(/^output(?:s)?\s*:\s*(.*)$/i);
        const bareName = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*$/);
        if (useRegistry) {
          current.declaration.binding = { kind: 'registry', locator: useRegistry[1] ?? useRegistry[2] ?? '' };
          concepts.add('MODEL');
        } else if (useExternal) {
          current.declaration.binding = { kind: useExternal[1].toLowerCase() as CoreSpiritModelSurfaceBinding['kind'], locator: useExternal[2] ?? useExternal[3] ?? '' };
          concepts.add('MODEL');
        } else if (inputLine) {
          const names = inputLine[1].trim() ? inputLine[1].split(/[,\s]+/).filter(Boolean) : [];
          for (const entry of names) {
            const field = parseModelField(entry);
            if (!field) continue;
            if (!current.declaration.inputs.includes(field.name)) current.declaration.inputs.push(field.name);
            current.declaration.inputTypes[field.name] = field.type;
            if (!current.declaration.features.includes(field.name)) current.declaration.features.push(field.name);
          }
          concepts.add('MODEL');
        } else if (outputLine) {
          const names = outputLine[1].trim() ? outputLine[1].split(/[,\s]+/).filter(Boolean) : [];
          for (const entry of names) {
            const field = parseModelField(entry);
            if (!field) continue;
            if (!current.declaration.outputs.includes(field.name)) current.declaration.outputs.push(field.name);
            current.declaration.outputTypes[field.name] = field.type;
            if (!current.declaration.predictions.includes(field.name)) current.declaration.predictions.push(field.name);
          }
          concepts.add('MODEL');
        } else if (/^predict\s+/.test(trimmed)) {
          const name = trimmed.replace(/^predict\s+/i, '').trim();
          if (name) current.declaration.outputs.push(name), current.declaration.predictions.push(name);
          concepts.add('MODEL');
        } else {
          const feature = trimmed.match(/^(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (feature) {
            current.declaration.features.push(feature[1]);
            if (!current.declaration.inputs.includes(feature[1])) current.declaration.inputs.push(feature[1]);
            concepts.add('MODEL');
          }
        }
      } else if (current.kind === 'automation') {
        const trigger = trimmed.match(/^when\s+(.+?)\s*:\s*$/i);
        if (trigger) {
          current.declaration.triggers.push(trigger[1].trim());
          concepts.add('WHEN');
        }
      }
    }

    if (/^when\b/i.test(trimmed)) concepts.add('WHEN');
    if (/^show\b/i.test(trimmed)) concepts.add('SHOW');
    if (/^(?:let\b|[A-Za-z_][A-Za-z0-9_]*\s*=)/.test(trimmed)) concepts.add('LET');
    if (/\b(?:open|high|low|close|volume|time|market|timeframe)\b/.test(trimmed)) concepts.add('DATA');

    for (const name of [...SHOW_NAMES, ...AUTOMATE_NAMES, ...MODEL_NAMES, ...DATA_NAMES]) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(trimmed)) {
        concepts.add(classifyCoreSpiritIdentifier(name)!);
      }
    }

    offset += raw.length + 1;
  }

  finishToIndent(-1, offset);

  const eventRoutes: CoreSpiritEventRoute[] = [];
  const routeLine = /^\s*route\s+(?:"([^"]+)"|'([^']+)')\s+to\s+(.+?)\s*$/i;
  const emitRouteLine = /^\s*emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s+(.+?)\s*$/i;
  const destination = (value: string): CoreSpiritEventDestination | undefined => {
    const text = value.trim();
    const webhook = text.match(/^webhook\s+(?:"([^"]+)"|'([^']+)')$/i);
    if (webhook) return { kind: 'webhook', target: webhook[1] ?? webhook[2] ?? '' };
    const automation = text.match(/^automation\s+(?:"([^"]+)"|'([^']+)')$/i);
    if (automation) return { kind: 'automation', target: automation[1] ?? automation[2] ?? '' };
    if (/^notification$/i.test(text)) return { kind: 'notification' };
    if (/^alert$/i.test(text)) return { kind: 'alert' };
    return undefined;
  };
  const sourceLines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const route = line.match(routeLine);
    const emitRoute = line.match(emitRouteLine);
    if (route || emitRoute) {
      const m = route ?? emitRoute!;
      const eventName = m[1] ?? m[2] ?? '';
      const d = destination(m[3]);
      if (d) eventRoutes.push({ eventName, destinations: [d], start: source.indexOf(line), end: source.indexOf(line) + line.length });
      continue;
    }
    const block = line.match(/^\s*emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s*:\s*$/i);
    if (block) {
      const eventName = block[1] ?? block[2] ?? '';
      const parentIndent = lineIndent(line);
      const destinations: CoreSpiritEventDestination[] = [];
      let j = i + 1;
      while (j < sourceLines.length) {
        const next = sourceLines[j];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) { j++; continue; }
        if (lineIndent(next) <= parentIndent) break;
        const d = destination(nextTrimmed);
        if (d) destinations.push(d);
        j++;
      }
      if (destinations.length) eventRoutes.push({ eventName, destinations, start: source.indexOf(line), end: source.indexOf(line) + line.length });
      i = j - 1;
    }
  }

  const mergedEventRoutes: CoreSpiritEventRoute[] = [];
  for (const route of eventRoutes) {
    const existing = mergedEventRoutes.find(item => item.eventName.toUpperCase() === route.eventName.toUpperCase());
    if (existing) {
      for (const item of route.destinations) {
        const duplicate = existing.destinations.some(existingDestination =>
          existingDestination.kind === item.kind &&
          ('target' in existingDestination ? existingDestination.target : undefined) === ('target' in item ? item.target : undefined),
        );
        if (!duplicate) existing.destinations.push(item);
      }
      existing.end = Math.max(existing.end, route.end);
    } else {
      mergedEventRoutes.push({
        ...route,
        destinations: [...route.destinations],
      });
    }
  }
  return makeCoreSpiritSurfaceMetadata(concepts, declarations, mergedEventRoutes);
}
