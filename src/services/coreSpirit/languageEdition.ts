/**
 * Source-file edition contract for CoreScript.
 *
 * The language/IR ABI version remains independent. An edition chooses source
 * grammar and normalization rules while every edition lowers into one AST/IR.
 */
export type CoreScriptEdition = '1.0' | '1.2';

export const CORE_SCRIPT_DEFAULT_EDITION: CoreScriptEdition = '1.0';
export const CORE_SCRIPT_SUPPORTED_EDITIONS: readonly CoreScriptEdition[] = Object.freeze(['1.0', '1.2']);

export type CoreScriptEditionDiagnostic = Readonly<{
  code: 'EDITION_HEADER_SYNTAX' | 'EDITION_HEADER_POSITION' | 'EDITION_DUPLICATE' | 'EDITION_UNSUPPORTED';
  message: string;
  line: number;
  column: number;
  start: number;
  end: number;
}>;

export type CoreScriptEditionResolution = Readonly<{
  edition: CoreScriptEdition;
  hasHeader: boolean;
  diagnostics: readonly CoreScriptEditionDiagnostic[];
}>;

function isDirectiveLine(line: string): boolean {
  return /^\s*edition\s*@/i.test(line);
}

/** Blank lines and // comments may precede the optional header. */
export function readCoreScriptEdition(source: string): CoreScriptEditionResolution {
  const text = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  let firstStatementLine = -1;
  let offset = 0;
  const directives: Array<{ line: string; lineIndex: number; start: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (isDirectiveLine(line)) directives.push({ line, lineIndex: index, start: offset });
    if (firstStatementLine < 0 && trimmed && !trimmed.startsWith('//')) firstStatementLine = index;
    offset += line.length + 1;
  }

  if (!directives.length) {
    return Object.freeze({ edition: CORE_SCRIPT_DEFAULT_EDITION, hasHeader: false, diagnostics: Object.freeze([]) });
  }

  const diagnostics: CoreScriptEditionDiagnostic[] = [];
  const first = directives[0]!;
  const firstColumn = Math.max(1, first.line.search(/\S/) + 1);
  if (first.lineIndex !== firstStatementLine) {
    diagnostics.push(Object.freeze({
      code: 'EDITION_HEADER_POSITION',
      message: 'The edition header must be the first non-comment, non-empty line in a CoreScript file.',
      line: first.lineIndex + 1,
      column: firstColumn,
      start: first.start + firstColumn - 1,
      end: first.start + first.line.length,
    }));
  }

  for (const duplicate of directives.slice(1)) {
    const column = Math.max(1, duplicate.line.search(/\S/) + 1);
    diagnostics.push(Object.freeze({
      code: 'EDITION_DUPLICATE',
      message: 'A CoreScript file may contain only one edition header.',
      line: duplicate.lineIndex + 1,
      column,
      start: duplicate.start + column - 1,
      end: duplicate.start + duplicate.line.length,
    }));
  }

  let edition: CoreScriptEdition = CORE_SCRIPT_DEFAULT_EDITION;
  const match = first.line.trim().match(/^edition@(\d+\.\d+)$/i);
  if (!match) {
    diagnostics.push(Object.freeze({
      code: 'EDITION_HEADER_SYNTAX',
      message: 'Invalid edition header. Use exactly edition@1.0 or edition@1.2.',
      line: first.lineIndex + 1,
      column: firstColumn,
      start: first.start + firstColumn - 1,
      end: first.start + first.line.length,
    }));
  } else if ((CORE_SCRIPT_SUPPORTED_EDITIONS as readonly string[]).includes(match[1]!)) {
    edition = match[1] as CoreScriptEdition;
  } else {
    diagnostics.push(Object.freeze({
      code: 'EDITION_UNSUPPORTED',
      message: `Unsupported CoreScript edition '${match[1]}'. Supported editions: ${CORE_SCRIPT_SUPPORTED_EDITIONS.join(', ')}.`,
      line: first.lineIndex + 1,
      column: firstColumn,
      start: first.start + firstColumn - 1,
      end: first.start + first.line.length,
    }));
  }

  return Object.freeze({ edition, hasHeader: true, diagnostics: Object.freeze(diagnostics) });
}

/**
 * Remove directive text while preserving each source line's length and newline.
 * This keeps compiler diagnostic and source-map coordinates stable.
 */
export function stripCoreScriptEditionDirectives(source: string): string {
  const text = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return text.split('\n').map(line =>
    isDirectiveLine(line) ? line.replace(/[^\t ]/g, ' ') : line,
  ).join('\n');
}

function normalizeAttributeValue(key: string, value: string): string | undefined {
  const raw = value.trim();
  const quoted = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(raw);
  if (key === 'color') {
    if (quoted) return raw[0] === "'" ? JSON.stringify(raw.slice(1, -1)) : raw;
    if (/^#[0-9a-f]{3,8}$/i.test(raw) || /^[a-z][a-z0-9-]*$/i.test(raw)) return JSON.stringify(raw);
    return undefined;
  }
  if (key === 'width') {
    const width = Number(raw);
    return Number.isInteger(width) && width >= 1 && width <= 5 ? String(width) : undefined;
  }
  if (key === 'style') {
    if (quoted) return undefined;
    const styles: Readonly<Record<string, number>> = { line: 0, solid: 0, dashed: 1, dotted: 2 };
    const style = styles[raw.toLowerCase()];
    return style === undefined ? undefined : String(style);
  }
  if (key === 'title') {
    if (quoted) return raw[0] === "'" ? JSON.stringify(raw.slice(1, -1)) : raw;
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(raw)) return JSON.stringify(raw);
  }
  return undefined;
}

/**
 * v1.2 compact plot surface:
 *   plot vwap() color=white width=1 style=line
 *
 * Only the existing plot ABI is targeted. Invalid/unknown suffixes are left
 * untouched so the normal parser emits a diagnostic rather than guessing.
 */
export function normalizeCoreScriptV12PlotShorthand(source: string): string {
  return String(source ?? '').split('\n').map(line => {
    const trimmed = line.trim();
    const header = trimmed.match(/^plot\s+([\s\S]+)$/i);
    if (!header) return line;

    let expressionAndOptions = header[1]!.replace(/;\s*$/, '').trim();
    const attributes: Record<string, string> = {};
    while (true) {
      const match = expressionAndOptions.match(/\s+(color|width|style|title)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[0-9a-f]{3,8}|[-+]?(?:\d+\.?\d*|\.\d+)|[A-Za-z_][A-Za-z0-9_-]*)\s*$/i);
      if (!match || match.index === undefined) break;
      const key = match[1]!.toLowerCase();
      if (attributes[key] !== undefined) return line;
      attributes[key] = match[2]!;
      expressionAndOptions = expressionAndOptions.slice(0, match.index).trim();
    }
    if (!expressionAndOptions) return line;

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      const next = normalizeAttributeValue(key, value);
      if (next === undefined) return line;
      normalized[key] = next;
    }
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const args = [
      expressionAndOptions,
      normalized.color ?? 'null',
      normalized.width ?? '2',
      normalized.style ?? '0',
      normalized.title ?? 'null',
    ];
    return `${indent}plot(${args.join(', ')});`;
  }).join('\n');
}
