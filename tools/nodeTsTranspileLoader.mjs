import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (!context.parentURL || !/^(?:\.?\.?\/|file:)/.test(specifier)) throw error;
    const base = specifier.startsWith('file:')
      ? fileURLToPath(specifier)
      : fileURLToPath(new URL(specifier, context.parentURL));

    // TypeScript ESM sources conventionally import sibling modules with a
    // runtime .js suffix. Node cannot resolve that emitted path before a build,
    // so map a missing explicit .js target back to its .ts/.tsx source file.
    const sourceBase = base.endsWith('.js') ? base.slice(0, -3) : base;
    const candidates = base.endsWith('.js')
      ? [sourceBase + '.ts', sourceBase + '.tsx']
      : ['.ts', '.tsx', '.js', '.mjs'].map(extension => base + extension);

    for (const candidate of candidates) {
      try {
        await stat(candidate);
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      } catch {
        // Continue through conventional source extensions.
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) {
    return defaultLoad(url, context, defaultLoad);
  }

  const source = await readFile(fileURLToPath(url), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      verbatimModuleSyntax: false,
      sourceMap: false,
    },
    fileName: fileURLToPath(url),
  });

  return {
    format: 'module',
    source: result.outputText,
    shortCircuit: true,
  };
}
