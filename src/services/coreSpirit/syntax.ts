/** CoreSpirit surface-syntax normalizer. Keeps the language concise while lowering
 * friendly syntax to the small deterministic core parser/compiler. */
import { normalizeCoreSpiritSource as normalizeCoreSpiritSurfaceSource } from './surfaceForms.js';
import { unwrapCoreSpiritProgramSource } from './parser.js';
import { normalizeCoreScriptV12PlotShorthand, readCoreScriptEdition, stripCoreScriptEditionDirectives } from './languageEdition.js';
import { normalizeCoreScriptV12LanguageSurface } from './languageV12Surface.js';

export function normalizeCoreSpiritSource(source: string): string {
  const edition = readCoreScriptEdition(source).edition;
  const withoutEdition = stripCoreScriptEditionDirectives(source);
  const unwrappedProgram = unwrapCoreSpiritProgramSource(withoutEdition);
  const programBody = unwrappedProgram?.source ?? withoutEdition;
  const editionSurface = edition === '1.2'
    ? normalizeCoreScriptV12PlotShorthand(normalizeCoreScriptV12LanguageSurface(programBody))
    : programBody;
  return normalizeCoreSpiritSurfaceSource(editionSurface);
}
