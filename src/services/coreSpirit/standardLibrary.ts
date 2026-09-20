export type CoreSpiritBuiltin = {
  name: string;
  minArgs: number;
  maxArgs?: number;
  returnType: 'number' | 'boolean' | 'event' | 'string' | 'series<number>' | 'unknown';
  pure: boolean;
  capability?: 'alert' | 'webhook' | 'market' | 'ai';
};

export const CORE_SPIRIT_STDLIB: readonly CoreSpiritBuiltin[] = [
  { name:'sma', minArgs:1, maxArgs:2, returnType:'number', pure:true },
  { name:'ema', minArgs:1, maxArgs:2, returnType:'number', pure:false },
  { name:'rsi', minArgs:1, maxArgs:2, returnType:'number', pure:false },
  { name:'atr', minArgs:0, maxArgs:1, returnType:'number', pure:false },
  { name:'vwap', minArgs:0, maxArgs:1, returnType:'number', pure:false },
  { name:'highest', minArgs:1, maxArgs:2, returnType:'number', pure:true },
  { name:'lowest', minArgs:1, maxArgs:2, returnType:'number', pure:true },
  { name:'change', minArgs:1, maxArgs:2, returnType:'number', pure:true },
  { name:'crossover', minArgs:2, maxArgs:2, returnType:'boolean', pure:true },
  { name:'crossunder', minArgs:2, maxArgs:2, returnType:'boolean', pure:true },
  { name:'nz', minArgs:1, maxArgs:2, returnType:'number', pure:true },
  { name:'isNa', minArgs:1, maxArgs:1, returnType:'boolean', pure:true },
  { name:'max', minArgs:2, maxArgs:2, returnType:'number', pure:true },
  { name:'min', minArgs:2, maxArgs:2, returnType:'number', pure:true },
  { name:'abs', minArgs:1, maxArgs:1, returnType:'number', pure:true },
  { name:'sqrt', minArgs:1, maxArgs:1, returnType:'number', pure:true },
  { name:'pow', minArgs:2, maxArgs:2, returnType:'number', pure:true },
  { name:'plot', minArgs:1, maxArgs:1, returnType:'event', pure:true },
  { name:'marker', minArgs:1, maxArgs:3, returnType:'event', pure:true },
  { name:'line', minArgs:4, maxArgs:5, returnType:'event', pure:true },
  { name:'zone', minArgs:4, maxArgs:5, returnType:'event', pure:true },
  { name:'signal', minArgs:1, maxArgs:2, returnType:'event', pure:false },
  { name:'alert', minArgs:0, returnType:'event', pure:false, capability:'alert' },
  { name:'webhook', minArgs:1, returnType:'event', pure:false, capability:'webhook' },
];

export const CORE_SPIRIT_BUILTINS = new Map(CORE_SPIRIT_STDLIB.map(x => [x.name, x]));
