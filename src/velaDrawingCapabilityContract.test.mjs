import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registry = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/registry.ts'), 'utf8');
const channel = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryChannels.ts'), 'utf8');
const fibonacci = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryFibonacci.ts'), 'utf8');
const patterns = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryPatterns.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'vendor/vela/src/renderers/native/drawings/UserDrawingController.ts'), 'utf8');
const toolbar = fs.readFileSync(path.join(root, 'vendor/vela/src/renderers/native/drawings/DrawingToolbar.ts'), 'utf8');

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

assert(!registry.includes("from './types/FibRetracement'"),'core drawing registry still imports Fibonacci implementation');
assert(!registry.includes("from './types/GannFan'"),'core drawing registry still imports Gann implementation');
assert(registry.includes("import('./advancedRegistryChannels')"),'channel catalog is not dynamically loaded');
assert(registry.includes("import('./advancedRegistryFibonacci')"),'Fibonacci catalog is not dynamically loaded');
assert(registry.includes("import('./advancedRegistryPatterns')"),'pattern catalog is not dynamically loaded');
assert(channel.includes('ParallelChannel'),'channel registry must own channel implementations');
assert(fibonacci.includes('FibRetracement'),'Fibonacci registry must own Fibonacci implementations');
assert(fibonacci.includes('GannFan'),'Fibonacci registry must own Gann implementations');
assert(patterns.includes('ElliottImpulse'),'pattern registry must own wave/pattern implementations');
assert(patterns.includes('FixedRangeVolumeProfile'),'pattern registry must own volume-profile implementation');
assert(!controller.includes('loadAdvancedDrawingCatalog'),'showing the toolbar must not eagerly load every advanced drawing family');
assert(!toolbar.includes('loadAdvancedDrawingCatalog'),'toolbar definitions must not eagerly hydrate every drawing family');
assert(toolbar.includes('loadDrawingFamily(family)'),'individual drawing families must load on request');
assert(toolbar.includes('Loading drawing tools…'),'requested drawing families need a visible pending state');
assert(toolbar.includes('Could not load drawing tools.'),'drawing-family download failures need a retryable visible state');
assert(controller.includes('this.customToolbar = !isCanonicalToolbarDefinition(def);'),'canonical and custom toolbars must be classified separately');
assert(controller.includes('this.toolbar.setDefinition(def);'),'the resolved toolbar definition must still be applied');
assert(toolbar.includes('this.hydrateLoadedTools();'),'downloaded family metadata must hydrate only after it becomes available');

console.log('VELA_DRAWING_CAPABILITY_SPLIT_OK');
