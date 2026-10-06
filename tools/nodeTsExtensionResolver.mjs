import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
        // Try the next conventional extension.
      }
    }

    throw error;
  }
}
