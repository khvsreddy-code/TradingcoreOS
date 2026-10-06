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

    for (const extension of ['.ts', '.tsx', '.js', '.mjs']) {
      try {
        await stat(base + extension);
        return { url: pathToFileURL(base + extension).href, shortCircuit: true };
      } catch {
        // Continue through conventional extensions.
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
