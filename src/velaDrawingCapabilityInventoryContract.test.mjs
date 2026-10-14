import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CORE_SPIRIT_DRAWING_TOOL_CATALOG} from './services/core/chart/velaDrawingCatalog.ts';
import {createDrawing,defaultToolbar,deserializeDrawing,drawingFamilyForType,drawingTypes,getDrawingType,loadAdvancedDrawingCatalog} from '../vendor/vela/src/core/drawings/index.ts';
const native=readFileSync('vendor/vela/src/renderers/native/drawings/UserDrawingController.ts','utf8');
const toolbarSource=readFileSync('vendor/vela/src/renderers/native/drawings/DrawingToolbar.ts','utf8');
assert.match(native,/new DrawingToolbar\(/);assert.match(native,/loadAdvancedDrawingCatalog/);assert.match(toolbarSource,/setDefinition\(/);
await loadAdvancedDrawingCatalog();
const registered=new Set(drawingTypes().map(m=>m.type));const reachable=new Set(defaultToolbar().groups.flatMap(g=>g.tools.map(t=>t.type)));
const inventory=CORE_SPIRIT_DRAWING_TOOL_CATALOG.map(type=>({type,implemented:!!getDrawingType(type),registered:registered.has(type),toolbarReachable:reachable.has(type),family:drawingFamilyForType(type)??'core'}));
assert.deepEqual(inventory.filter(x=>!x.implemented||!x.registered||!x.toolbarReachable),[],'every advertised drawing must be registered and reachable from the native toolbar');
for(const row of inventory){const drawing=createDrawing(row.type,{paneId:'price'});assert.ok(drawing,`factory unavailable for ${row.type}`);assert.equal(deserializeDrawing(drawing.serialize())?.type,row.type,`persistence round-trip failed for ${row.type}`);}
console.log(`VELA_DRAWING_CAPABILITY_INVENTORY_OK (${inventory.length} tools)`);
