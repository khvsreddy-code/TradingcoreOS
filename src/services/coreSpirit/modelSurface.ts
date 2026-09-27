/**
 * CoreSpirit MODEL surface.
 *
 * MODEL is a declaration-level user concept. This layer turns concise model
 * bindings into stable surface metadata and normalizes model-qualified output
 * references to the one core expression grammar. The actual ABI/adapters remain
 * host/runtime concerns.
 */

import type { CoreSpiritSurfaceDeclaration, CoreSpiritModelSurfaceBinding, CoreSpiritModelSurfaceFieldType } from './languageConcepts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts';

export type CoreSpiritModelSurfaceDeclaration = Extract<CoreSpiritSurfaceDeclaration, { kind: 'model' }>;

export function getCoreSpiritModelSurfaceDeclarations(source: string): CoreSpiritModelSurfaceDeclaration[] {
  return extractCoreSpiritSurfaceMetadata(source).declarations.filter(
    (declaration): declaration is CoreSpiritModelSurfaceDeclaration => declaration.kind === 'model',
  );
}

export function normalizeCoreSpiritModelBinding(
  binding: CoreSpiritModelSurfaceBinding | undefined,
): CoreSpiritModelSurfaceBinding | undefined {
  if (!binding) return undefined;
  return { kind: binding.kind, locator: binding.locator.trim() };
}

export function modelSurfaceNames(source: string): ReadonlySet<string> {
  return new Set(getCoreSpiritModelSurfaceDeclarations(source).map(model => model.name));
}

function replaceModelQualifiedReferences(text: string, modelNames: ReadonlySet<string>): string {
  let out = text;
  for (const name of modelNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\.([A-Za-z_][A-Za-z0-9_]*)`, 'g'), `model("${name}").$1`);
  }
  return out;
}

export function normalizeCoreSpiritModelReferences(
  expression: string,
  modelNames: ReadonlySet<string>,
): string {
  return replaceModelQualifiedReferences(expression, modelNames);
}

export function isModelNameExpression(expression: string, modelNames: ReadonlySet<string>): boolean {
  return modelNames.has(expression.trim());
}

export function normalizedModelReference(name: string): string {
  return `model("${name}")`;
}

export function modelSurfaceOutputType(
  declaration: CoreSpiritModelSurfaceDeclaration,
  field: string,
): CoreSpiritModelSurfaceFieldType {
  return declaration.outputTypes?.[field] ?? 'unknown';
}
