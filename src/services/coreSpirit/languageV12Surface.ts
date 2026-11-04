
/**
 * Built-in module imports and enum declarations are source-only conveniences.
 * Imports resolve exclusively to registered CoreScript standard-library namespaces;
 * they never read the filesystem, network, browser globals or arbitrary modules.
 */
const CORE_SCRIPT_BUILTIN_MODULES = new Set([
  'core','market','series','math','stats','time','structure','volatility','liquidity',
  'probability','regime','model','ml','prediction','visual','chart','automation','events',
  'strategy','portfolio','risk','background','ta','data','orderflow','options','state',
]);

function replaceCoreScriptCodeIdentifiers(source: string, replacements: ReadonlyMap<string,string>): string {
  let output = '';
  let quote: '"' | "'" | '\x60' | null = null;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (quote) {
      output += character;
      index += 1;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '\x60') {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index + 2);
      if (end < 0) { output += source.slice(index); break; }
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) { output += source.slice(index); break; }
      output += source.slice(index, end + 2);
      index = end + 2;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end]!)) end += 1;
      const identifier = source.slice(index, end);
      output += replacements.get(identifier) ?? identifier;
      index = end;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

function normalizeCoreScriptV12Imports(source: string): string {
  const replacements = new Map<string,string>();
  const output: string[] = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    const namespaceImport = trimmed.match(/^import\s+(?:\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*))\s+from\s+["']([A-Za-z_][A-Za-z0-9_]*)["']\s*;?$/);
    if (namespaceImport) {
      const alias = namespaceImport[1] ?? namespaceImport[2]!;
      const moduleName = namespaceImport[3]!;
      if (!CORE_SCRIPT_BUILTIN_MODULES.has(moduleName)) { output.push(line); continue; }
      replacements.set(alias, moduleName);
      continue;
    }

    const namedImport = trimmed.match(/^import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([A-Za-z_][A-Za-z0-9_]*)["']\s*;?$/);
    if (namedImport) {
      const moduleName = namedImport[2]!;
      if (!CORE_SCRIPT_BUILTIN_MODULES.has(moduleName)) { output.push(line); continue; }
      const members = namedImport[1]!.split(',').map(part => part.trim()).filter(Boolean);
      let valid = members.length > 0;
      for (const member of members) {
        const match = member.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
        if (!match) { valid = false; break; }
        const imported = match[1]!;
        const alias = match[2] ?? imported;
        replacements.set(alias, moduleName + '.' + imported);
      }
      if (valid) continue;
      output.push(line);
      continue;
    }
    output.push(line);
  }
  return replaceCoreScriptCodeIdentifiers(output.join('\n'), replacements);
}

function rewriteCoreScriptEnumMembers(source: string, replacements: ReadonlyMap<string,string>): string {
  let output = '';
  let quote: '"' | "'" | '\x60' | null = null;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (quote) {
      output += character; index += 1;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '\x60') { quote = character; output += character; index += 1; continue; }
    if (character === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index + 2);
      if (end < 0) { output += source.slice(index); break; }
      output += source.slice(index, end); index = end; continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) { output += source.slice(index); break; }
      output += source.slice(index, end + 2); index = end + 2; continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end]!)) end += 1;
      const name = source.slice(index, end);
      let memberStart = end;
      while (memberStart < source.length && /[ \t]/.test(source[memberStart]!)) memberStart += 1;
      if (source[memberStart] === '.') {
        let memberEnd = memberStart + 1;
        while (memberEnd < source.length && /[ \t]/.test(source[memberEnd]!)) memberEnd += 1;
        if (/[A-Za-z_]/.test(source[memberEnd] ?? '')) {
          let endIdentifier = memberEnd + 1;
          while (endIdentifier < source.length && /[A-Za-z0-9_]/.test(source[endIdentifier]!)) endIdentifier += 1;
          const replacement = replacements.get(name + '.' + source.slice(memberEnd, endIdentifier));
          if (replacement) { output += replacement; index = endIdentifier; continue; }
        }
      }
      output += name; index = end; continue;
    }
    output += character; index += 1;
  }
  return output;
}

/**
 * Enum syntax is deliberately value-only in this release: members lower to
 * constants in the shared expression language. Default values are their names;
 * explicit string/integer literal values are also accepted.
 */
function normalizeCoreScriptV12Enums(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  const members = new Map<string,string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = line.match(/^(\s*)enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{(.*)$/);
    if (!header) { output.push(line); continue; }
    const indent = header[1]!;
    const enumName = header[2]!;
    let body = header[3]!;
    const inlineClose = body.lastIndexOf('}');
    if (inlineClose >= 0) {
      if (body.slice(inlineClose + 1).trim()) { output.push(line); continue; }
      body = body.slice(0, inlineClose);
    } else {
      let closed = false;
      while (++index < lines.length) {
        const candidate = lines[index]!;
        const close = candidate.trim() === '}';
        if (close) { closed = true; break; }
        body += '\n' + candidate;
      }
      if (!closed) { output.push(line); continue; }
    }

    const declarations: string[] = [];
    let valid = true;
    const rawMembers = body.split(/[\n,]/).map(part => part.trim()).filter(Boolean);
    if (!rawMembers.length) valid = false;
    const seen = new Set<string>();
    for (let memberIndex = 0; memberIndex < rawMembers.length; memberIndex += 1) {
      const member = rawMembers[memberIndex]!.replace(/\/\/.*$/, '').trim();
      if (!member) continue;
      const match = member.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|-?\d+))?$/);
      if (!match || seen.has(match[1]!)) { valid = false; break; }
      const memberName = match[1]!;
      seen.add(memberName);
      const constantName = enumName + '__' + memberName;
      const value = match[2] ?? JSON.stringify(memberName);
      declarations.push(indent + 'let ' + constantName + ' = ' + value + ';');
      members.set(enumName + '.' + memberName, constantName);
    }
    if (!valid) {
      // Preserve malformed syntax so the normal parser emits an ordinary source diagnostic.
      output.push(line);
      continue;
    }
    output.push(...declarations);
  }
  return rewriteCoreScriptEnumMembers(output.join('\n'), members);
}

export function normalizeCoreScriptV12LanguageSurface(source: string): string {
  return normalizeCoreScriptV12Enums(normalizeCoreScriptV12Imports(source));
}
