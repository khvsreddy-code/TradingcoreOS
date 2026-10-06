import type { CoreSpiritCompileResult } from './coreSpiritPipeline';

type CoreSpiritCompilerModule = typeof import('./coreSpiritPipeline');

let compilerPromise: Promise<CoreSpiritCompilerModule> | undefined;

function loadModule(): Promise<CoreSpiritCompilerModule> {
  compilerPromise ??= import('./coreSpiritPipeline');
  return compilerPromise;
}

/** Load the CoreSpirit compiler only from an authoring/compile action. */
export async function compileCoreSpirit(
  source: string,
  sourceId = 'coreSpirit',
  options?: Parameters<CoreSpiritCompilerModule['compileCoreSpirit']>[2],
): Promise<CoreSpiritCompileResult> {
  const module = await loadModule();
  return module.compileCoreSpirit(source, sourceId, options);
}

export function preloadCoreSpiritCompiler(): void {
  void loadModule();
}
