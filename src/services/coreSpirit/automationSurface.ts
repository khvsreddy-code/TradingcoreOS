/**
 * Concise AUTOMATE surface.
 *
 * Users learn one action: `order`. Legacy entry/exit/buy/sell calls remain
 * compatibility APIs, but new automation syntax lowers to one canonical
 * order-intent record.
 */

type PendingOrder = {
  index: number;
  indent: string;
  side: 'long' | 'short' | 'exit';
  sizingKind: 'quantity' | 'risk' | 'all';
  sizingValue: string;
  stop: string;
  target: string;
};

type PendingOrderBlock = PendingOrder & { blockIndent: number };

function indent(raw: string): number {
  return raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;
}

function normalizeAtrExpression(expression: string): string {
  const text = expression.trim();
  if (!text) return text;
  const withDefaultAtr = text.replace(/\batr\b(?!\s*\()/gi, 'atr(14)');
  return withDefaultAtr.replace(/(\d+(?:\.\d+)?)\s+atr\((\d+)\)/gi, '$1 * atr($2)');
}

function parseSizing(text: string): { kind: 'quantity' | 'risk' | 'all'; value: string } | null {
  const size = text.trim();
  const risk = size.match(/^(\d+(?:\.\d+)?)\s*%\s*risk$/i);
  const quantity = size.match(/^(\d+(?:\.\d+)?)\s*(?:quantity)?$/i);
  if (risk) return { kind: 'risk', value: risk[1] };
  if (quantity) return { kind: 'quantity', value: quantity[1] };
  if (/^all$/i.test(size)) return { kind: 'all', value: '0' };
  return null;
}

function parseOrderLine(text: string): Omit<PendingOrder, 'index' | 'indent' | 'stop' | 'target'> | null {
  const t = text.trim().replace(/;$/, '');
  const match = t.match(/^order\s+(long|short|exit|flat)\s*(.*)$/i);
  if (!match) return null;
  const side = match[1].toLowerCase();
  let tail = match[2].trim();
  let stop = '';
  let target = '';
  const stopMatch = tail.match(/\s+stop\s+(.+?)(?=\s+target\s+|$)/i);
  if (stopMatch) { stop = normalizeAtrExpression(stopMatch[1]); tail = tail.replace(stopMatch[0], '').trim(); }
  const targetMatch = tail.match(/\s+target\s+(.+)$/i);
  if (targetMatch) { target = normalizeAtrExpression(targetMatch[1]); tail = tail.replace(targetMatch[0], '').trim(); }
  if (side === 'exit' || side === 'flat') {
    if (tail && !/^all$/i.test(tail)) throw new Error('exit order currently accepts `all` sizing only');
    return { side: 'exit', sizingKind: 'all', sizingValue: '0' } as any;
  }
  const sizing = parseSizing(tail);
  if (!sizing || sizing.kind === 'all') return null;
  return { side: side as 'long' | 'short', sizingKind: sizing.kind, sizingValue: sizing.value };
}

function renderPending(order: PendingOrder): string {
  return `order("${order.side}", "${order.sizingKind}", ${order.sizingValue}, ${order.stop || 'null'}, ${order.target || 'null'});`;
}

function normalizeDirectionWhen(trimmed: string): string | null {
  const m = trimmed.match(/^when\s+(long|short|flat)\s*:\s*$/i);
  if (!m) return null;
  return `when "${m[1].toUpperCase()}":`;
}

export function normalizeCoreSpiritAutomationSource(source: string): string {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let automationDepth: number | null = null;
  let pending: PendingOrder | null = null;
  let pendingBlock: PendingOrderBlock | null = null;

  const flushPending = () => {
    if (!pending) return;
    out[pending.index] = `${pending.indent}${renderPending(pending)}`;
    pending = null;
  };
  const flushBlock = () => {
    if (!pendingBlock) return;
    out[pendingBlock.index] = `${pendingBlock.indent}${renderPending(pendingBlock)}`;
    pendingBlock = null;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    const currentIndent = indent(raw);
    if (!trimmed || trimmed.startsWith('//')) { out.push(raw); continue; }

    const header = trimmed.match(/^automate\s+(?:"[^"]+"|'[^']+')\s*:\s*$/i);
    if (header) { flushBlock(); flushPending(); automationDepth = currentIndent; out.push(raw); continue; }
    if (automationDepth !== null && currentIndent <= automationDepth) { flushBlock(); flushPending(); automationDepth = null; }
    if (automationDepth === null || currentIndent <= automationDepth) { out.push(raw); continue; }

    if (pendingBlock && currentIndent > pendingBlock.blockIndent) {
      const side = trimmed.match(/^side\s*:\s*(long|short|exit|flat)\s*$/i);
      const risk = trimmed.match(/^risk\s*:\s*(\d+(?:\.\d+)?)\s*%?\s*$/i);
      const quantity = trimmed.match(/^(?:quantity|size)\s*:\s*(\d+(?:\.\d+)?)\s*$/i);
      const all = trimmed.match(/^quantity\s*:\s*all\s*$/i);
      const stop = trimmed.match(/^stop\s*:\s*(.+?)\s*;?$/i);
      const target = trimmed.match(/^target\s*:\s*(.+?)\s*;?$/i);
      if (side) pendingBlock.side = side[1].toLowerCase() === 'flat' ? 'exit' : side[1].toLowerCase() as any;
      else if (risk) { pendingBlock.sizingKind = 'risk'; pendingBlock.sizingValue = risk[1]; }
      else if (quantity) { pendingBlock.sizingKind = 'quantity'; pendingBlock.sizingValue = quantity[1]; }
      else if (all) { pendingBlock.sizingKind = 'all'; pendingBlock.sizingValue = '0'; }
      else if (stop) pendingBlock.stop = normalizeAtrExpression(stop[1]);
      else if (target) pendingBlock.target = normalizeAtrExpression(target[1]);
      else { flushBlock(); out.push(raw); }
      continue;
    }

    const directionWhen = normalizeDirectionWhen(trimmed);
    if (directionWhen) { flushBlock(); flushPending(); out.push(`${raw.match(/^[ \t]*/)?.[0] ?? ''}${directionWhen}`); continue; }

    if (/^order\s*:\s*$/i.test(trimmed)) {
      flushPending();
      pendingBlock = {
        index: out.length,
        indent: raw.match(/^[ \t]*/)?.[0] ?? '',
        blockIndent: currentIndent,
        side: 'long', sizingKind: 'quantity', sizingValue: '1', stop: '', target: '',
      };
      out.push('');
      continue;
    }

    if (pending && currentIndent >= indent(pending.indent)) {
      const modifierStop = trimmed.match(/^stop\s+(.+?)\s*;?$/i);
      const modifierTarget = trimmed.match(/^target\s+(.+?)\s*;?$/i);
      if (modifierStop) { pending.stop = normalizeAtrExpression(modifierStop[1]); out.push(''); continue; }
      if (modifierTarget) { pending.target = normalizeAtrExpression(modifierTarget[1]); out.push(''); continue; }
    }

    const order = parseOrderLine(trimmed);
    if (order) {
      flushPending();
      pending = { ...order, index: out.length, indent: raw.match(/^[ \t]*/)?.[0] ?? '', stop: '', target: '' };
      out.push('');
      continue;
    }

    flushBlock();
    flushPending();
    out.push(raw);
  }
  flushBlock();
  flushPending();
  return out.join('\n');
}
