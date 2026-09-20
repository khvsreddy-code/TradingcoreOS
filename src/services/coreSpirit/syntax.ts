/** CoreSpirit surface-syntax normalizer. Keeps the language concise while lowering
 * friendly syntax to the small deterministic core parser/compiler. */
export function normalizeCoreSpiritSource(source: string): string {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let wrapperDepth = 0;

  for (let raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//')) { out.push(raw); continue; }

    // `indicator("Name") { ... }` is metadata syntax. Preserve its body; only
    // remove the wrapper so the actual script remains executable.
    if (wrapperDepth === 0 && /^indicator\s*(?:\([^)]*\)|["'][^"']*["'])\s*\{\s*$/i.test(trimmed)) {
      wrapperDepth = 1;
      continue;
    }
    if (wrapperDepth > 0) {
      const opens = (raw.match(/\{/g) || []).length;
      const closes = (raw.match(/\}/g) || []).length;
      // A bare closing brace closes the indicator wrapper; nested blocks remain.
      if (wrapperDepth === 1 && trimmed === '}') { wrapperDepth = 0; continue; }
      wrapperDepth += opens - closes;
      if (wrapperDepth <= 0) { wrapperDepth = 0; continue; }
    }

    // Indicator metadata is consumed by the editor/runtime shell, not the VM core.
    if (wrapperDepth > 0 && /^(overlay|pane|description|precision|format)\s*:/i.test(trimmed)) continue;

    // Concise inputs. `input length = int(20, min: 1)` lowers to a normal value
    // declaration for the deterministic core; richer UI metadata is retained by
    // the editor layer rather than being executed by the VM.
    raw = raw.replace(/^(\s*)input\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:int|float|number|bool|string)\s*\(\s*([^,)]*).*\)\s*;?$/i, '$1let $2 = $3;');
    raw = raw.replace(/^(\s*)input\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i, '$1let $2 = $3');

    // Human-readable crossover operators.
    raw = raw.replace(/\b([A-Za-z_][A-Za-z0-9_\[\]]*)\s+crossesAbove\s+([A-Za-z_][A-Za-z0-9_\[\]]*)/g, 'crossover($1, $2)');
    raw = raw.replace(/\b([A-Za-z_][A-Za-z0-9_\[\]]*)\s+crossesBelow\s+([A-Za-z_][A-Za-z0-9_\[\]]*)/g, 'crossunder($1, $2)');

    const assignment = raw.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignment && !/^\s*(if|let|plot|signal|indicator|input)\b/.test(raw)) raw = `${assignment[1]}let ${assignment[2]} = ${assignment[3]}`;

    const ifMatch = raw.match(/^(\s*)if\s+(.+?)(\s*\{)?\s*$/);
    if (ifMatch && !ifMatch[2].startsWith('(')) raw = `${ifMatch[1]}if (${ifMatch[2].replace(/\s*\{$/, '')})${ifMatch[3] ? ' {' : ''}`;

    // Friendly plot/signal forms and optional names.
    const plotBare = raw.match(/^(\s*)plot\s+(.+?)\s*;?$/);
    if (plotBare && !plotBare[2].startsWith('(')) raw = `${plotBare[1]}plot(${plotBare[2]});`;
    raw = raw.replace(/plot\(([^,()]+),\s*name\s*=\s*[^)]+\)/g, 'plot($1)');
    const signalBare = raw.match(/^(\s*)signal\s+(.+?)\s*;?$/);
    if (signalBare && !signalBare[2].startsWith('(')) raw = `${signalBare[1]}signal(${signalBare[2]});`;

    out.push(raw);
  }
  return out.join('\n');
}
