import type { CoreSpiritEventDestination } from './languageConcepts';
import { normalizeCoreSpiritModelReferences } from './modelSurface';

export type CoreSpiritWhenSourceKind =
  | 'event'
  | 'condition';

function quote(value: string): string {
  return JSON.stringify(value);
}

function destination(text: string): CoreSpiritEventDestination | undefined {
  const t = text.trim();
  const webhook = t.match(/^webhook\s+(?:"([^"]+)"|'([^']+)')$/i);
  if (webhook) return { kind: 'webhook', target: webhook[1] ?? webhook[2] ?? '' };
  const automation = t.match(/^automation\s+(?:"([^"]+)"|'([^']+)')$/i);
  if (automation) return { kind: 'automation', target: automation[1] ?? automation[2] ?? '' };
  if (/^notification$/i.test(t)) return { kind: 'notification' };
  if (/^alert$/i.test(t)) return { kind: 'alert' };
  return undefined;
}

export function normalizeCoreSpiritEventSource(source: string): string {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (/^route\s+(?:"[^"]+"|'[^']+')\s+to\s+/i.test(trimmed)) {
      continue; // route declarations are artifact metadata, not executable statements.
    }

    const block = trimmed.match(/^emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s*:\s*$/i);
    if (block) {
      const indent = raw.match(/^[ \t]*/)?.[0] ?? '';
      const name = block[1] ?? block[2] ?? '';
      out.push(`${indent}emit(${quote(name)});`);
      const parentIndent = raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) { i++; continue; }
        const nextIndent = next.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
        if (nextIndent <= parentIndent) { i--; break; }
        // Destination lines are metadata-only.
        if (!destination(nextTrimmed)) out.push(next);
        i++;
      }
      continue;
    }

    const inline = trimmed.match(/^emit\s+(?:"([^"]+)"|'([^']+)')\s+to\s+.+$/i);
    if (inline) {
      const indent = raw.match(/^[ \t]*/)?.[0] ?? '';
      const name = inline[1] ?? inline[2] ?? '';
      out.push(`${indent}emit(${quote(name)});`);
      continue;
    }

    const bare = trimmed.match(/^emit\s+(?:"([^"]+)"|'([^']+)')\s*;?$/i);
    if (bare) {
      const indent = raw.match(/^[ \t]*/)?.[0] ?? '';
      const name = bare[1] ?? bare[2] ?? '';
      out.push(`${indent}emit(${quote(name)});`);
      continue;
    }

    out.push(raw);
  }
  return out.join('\n');
}

export function normalizeCoreSpiritWhenCondition(
  condition: string,
  modelNames: ReadonlySet<string>,
): string {
  let c = condition.trim();
  c = c
    .replace(/\b([A-Za-z_][A-Za-z0-9_\[\]]*)\s+crossesAbove\s+([A-Za-z_][A-Za-z0-9_\[\]]*)/g, 'crossover($1, $2)')
    .replace(/\bcrossesAbove\s*\(([^,()]+),\s*([^()]+)\)/g, 'crossover($1, $2)')
    .replace(/\b([A-Za-z_][A-Za-z0-9_\[\]]*)\s+crossesBelow\s+([A-Za-z_][A-Za-z0-9_\[\]]*)/g, 'crossunder($1, $2)')
    .replace(/\bcrossesBelow\s*\(([^,()]+),\s*([^()]+)\)/g, 'crossunder($1, $2)');

  const webhook = c.match(/^webhook\s+(?:"([^"]+)"|'([^']+)')$/i);
  if (webhook) {
    const name = `webhook:${webhook[1] ?? webhook[2] ?? ''}`;
    return `event(${quote(name)})`;
  }
  if (/^bar\s+closes?$/i.test(c)) return `event("bar.closes")`;
  if (/^fill$/i.test(c)) return `event("fill")`;
  if (/^price\s+enters?\s+zone$/i.test(c)) return `event("price.enters.zone")`;
  if (/^(long|short|flat)$/i.test(c)) return `event(${quote(c.toUpperCase())})`;
  if (/^(?:"[^"]*"|'[^']*')$/.test(c)) return `event(${c})`;
  if (/^event\s+(?:"[^"]*"|'[^']*')$/i.test(c)) {
    const m = c.match(/^event\s+(?:"([^"]+)"|'([^']+)')$/i)!;
    return `event(${quote(m[1] ?? m[2] ?? '')})`;
  }
  return normalizeCoreSpiritModelReferences(c, modelNames);
}
