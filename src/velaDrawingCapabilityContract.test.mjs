import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registry = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/registry.ts'), 'utf8');
const channel = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryChannels.ts'), 'utf8');
const fibonacci = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryFibonacci.ts'), 'utf8');
const patterns = fs.readFileSync(path.join(root, 'vendor/vela/src/core/drawings/advancedRegistryPatterns.ts'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'vendor/vela/src/renderers/native/drawings/UserDrawingController.ts'), 'utf8');

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
assert(controller.includes('loadAdvancedDrawingCatalog'),'drawing controller must load advanced catalogs only with toolbar capability');
assert(controller.includes('if (!this.customToolbar)'),'custom toolbar definitions must not be overwritten by the default advanced reload');

console.log('VELA_DRAWING_CAPABILITY_SPLIT_OK');
