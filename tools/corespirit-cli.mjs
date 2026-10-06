#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , command, fileArg] = process.argv;

if (!command || !fileArg || !['check', 'normalize', 'inspect', 'graph'].includes(command)) {
  console.error('Usage: npm run coreSpirit:check -- <file> | npm run coreSpirit:normalize -- <file> | npm run coreSpirit:inspect -- <file> | npm run coreSpirit:graph -- <file>');
  process.exit(2);
}

const file = resolve(fileArg);
const source = await readFile(file, 'utf8');
const commandCode = command === 'normalize'
  ? 'console.log(inspected.normalizedSource);'
  : command === 'graph'
    ? 'console.log(inspected.executionPlanVisualization ? formatCoreSpiritExecutionPlanVisualization(inspected.executionPlanVisualization) : JSON.stringify(inspected.effectAnnotations, null, 2));'
    : command === 'inspect'
      ? 'console.log(JSON.stringify(inspected, null, 2));'
      : 'for (const d of inspected.diagnostics) console.log(String(d.severity) + ": " + String(d.message) + (d.line ? " @ " + d.line + ":" + (d.column ?? 1) : "")); process.exitCode = inspected.diagnostics.some(d => d.severity === "error") ? 1 : 0;';
const script = `import { inspectCoreSpiritSource } from ${JSON.stringify(resolve('src/services/coreSpirit/sourceInspector.ts'))}; import { formatCoreSpiritExecutionPlanVisualization } from ${JSON.stringify(resolve('src/services/coreSpirit/executionPlanVisualizer.ts'))}; const source=${JSON.stringify(source)}; const inspected=inspectCoreSpiritSource(source, ${JSON.stringify(file)}); ${commandCode}`;
const result = spawnSync(process.execPath, ['--import', 'tsx/esm', '--eval', script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
