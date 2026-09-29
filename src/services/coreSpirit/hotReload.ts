import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritAst } from './ast';
import { CoreSpiritRuntime, CoreSpiritRuntimeState } from './runtime';
import { CoreSpiritProgram } from './types';

export type CoreSpiritHotReloadResult = {
  committed: boolean;
  generation: number;
  diagnostics: string[];
  preservedState: boolean;
};

type Checkpoint = {
  state: CoreSpiritRuntimeState;
  history: any[];
  crossState: Record<string,{a:number;b:number}>;
  committedSeriesState: Record<string,number[]>;
  committedLocalSeries: Record<string,Array<number|boolean|string|null>>;
  committedCrossState: Record<string,{a:number;b:number}>;
};

/** Transactional runtime owner: compile off to the side, then atomically swap. */
export class CoreSpiritHotReloadController {
  private active: CoreSpiritRuntime | null = null;
  private generation = 0;
  private compiling = false;
  private abort?: AbortController;

  getActive() { return this.active; }
  getGeneration() { return this.generation; }
  isCompiling() { return this.compiling; }

  async reload(ast: CoreSpiritAst, sourceId = 'coreSpirit'): Promise<CoreSpiritHotReloadResult> {
    this.abort?.abort();
    const abort = new AbortController(); this.abort = abort; this.compiling = true;
    try {
      await Promise.resolve();
      if (abort.signal.aborted) return { committed:false,generation:this.generation,diagnostics:['Compilation cancelled'],preservedState:false };
      const compiler = new CoreSpiritCompiler();
      const compiled = compiler.compile(ast, sourceId);
      const errors = compiled.diagnostics.filter(d => d.severity === 'error');
      if (!compiled.ir || errors.length) return { committed:false,generation:this.generation,diagnostics:compiled.diagnostics.map(d=>d.message),preservedState:false };
      const old = this.active;
      const next = new CoreSpiritRuntime({ sourceId });
      const checkpoint = old?.exportCheckpoint();
      next.loadIr(compiled.ir);
      let preservedState = false;
      if (checkpoint) preservedState = next.restoreCheckpoint(checkpoint);
      if (abort.signal.aborted) return { committed:false,generation:this.generation,diagnostics:['Compilation cancelled'],preservedState:false };
      this.active = next;
      this.generation++;
      return { committed:true,generation:this.generation,diagnostics:[],preservedState };
    } finally { if (this.abort === abort) this.abort = undefined; this.compiling = false; }
  }
}
