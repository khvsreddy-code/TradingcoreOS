import { normalizeCoreSpiritSource, describeCoreSpiritSurface } from './surfaceForms';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { CoreSpiritV1Runtime } from './coreSpiritV1Runtime';
import { CoreSpiritEventRouter, createNamedCoreSpiritEvent } from './eventSystem';

function assertIncludes(text: string, fragment: string, message: string) {
  if (!text.includes(fragment)) throw new Error(`${message}\nExpected: ${fragment}\nActual:\n${text}`);
}

export async function runStage52_53EventWhenSurfaceContract() {
  const source = `
model "Regime":
  output:
    confidence: number

emit "LONG"
route "LONG" to webhook "my-server"
route "LONG" to notification
route "LONG" to automation "Momentum"

emit "RISK" to:
  webhook "risk-server"
  automation "Risk"
  alert

when "LONG":
  show close on price

when bar closes:
  show close

when fill:
  show close

when Regime.confidence > 0.8:
  show close

when price enters zone:
  show close

when webhook "risk-update":
  show close
`.trim();

  const surface = describeCoreSpiritSurface(source);
  if (surface.eventRoutes?.length !== 2) throw new Error(`expected 2 event route declarations, got ${surface.eventRoutes?.length ?? 0}`);
  const longRoutes = surface.eventRoutes?.find(r => r.eventName === 'LONG');
  if (!longRoutes || longRoutes.destinations.length !== 3) throw new Error('LONG event routes did not capture all destinations');
  const riskRoutes = surface.eventRoutes?.find(r => r.eventName === 'RISK');
  if (!riskRoutes || riskRoutes.destinations.length !== 3) throw new Error('RISK emit block routes did not capture all destinations');

  const normalized = normalizeCoreSpiritSource(source);
  if (!normalized.includes('emit("LONG");')) throw new Error('bare emit did not normalize');
  if (!normalized.includes('emit("RISK");')) throw new Error('emit-to block did not normalize');
  if (/\broute\s+["']/i.test(normalized)) throw new Error('route metadata leaked into executable source');
  assertIncludes(normalized, 'if (event("LONG")) {', 'quoted WHEN did not lower to event query');
  assertIncludes(normalized, 'if (event("bar.closes")) {', 'bar closes WHEN did not lower to event query');
  assertIncludes(normalized, 'if (event("fill")) {', 'fill WHEN did not lower to event query');
  assertIncludes(normalized, 'if (model("Regime").confidence > 0.8) {', 'model condition should remain expression-driven');
  assertIncludes(normalized, 'if (event("price.enters.zone")) {', 'price enters zone WHEN did not lower to event query');
  assertIncludes(normalized, 'if (event("webhook:risk-update")) {', 'webhook WHEN did not lower to scoped event query');

  const parsed = new CoreSpiritParser(normalized).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d => d.message).join('; '));
  const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'stage52_53:event', { layer: 'script', surface });
  if (!compiled.ir) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  if (!compiled.ir.surface?.eventRoutes?.some(route => route.eventName === 'LONG')) throw new Error('event routes were not attached to executable IR');
  const eventEmit = compiled.ir.entry.instructions.find((i:any) => i.op === 'emit' && i.kind === 'event');
  if (!eventEmit) throw new Error('emit did not compile to canonical event IR');
  if (compiled.ir.entry.instructions.some((i:any) => i.op === 'emit' && ['alert','webhook','signal'].includes(i.kind))) {
    throw new Error('new event surface must not compile into alert/webhook/signal-specific emission');
  }

  const seen: string[] = [];
  const runtime = new CoreSpiritRuntime({
    sourceId: 'stage52_53:event',
    layer: 'script',
    executionMode: 'historical',
    eventResolver: name => name === 'LONG' || name === 'bar.closes' || name === 'fill' || name === 'price.enters.zone' || name === 'webhook:risk-update',
  });
  runtime.loadProgram({ version:1, id:'stage52_53:event', source:normalized, ast:parsed.ast, surface });
  const result = runtime.executeBar({
    timestamp:'2026-09-27T09:15:00Z', open:100, high:102, low:99, close:101, volume:1000,
  });
  if (!result.outputs.some((o:any)=>o.kind === 'event' && o.name === 'LONG')) throw new Error('runtime did not produce canonical event output');
  if (!result.outputs.some((o:any)=>o.kind === 'series')) throw new Error('WHEN event conditions did not execute downstream body');

  const event = createNamedCoreSpiritEvent({
    sourceId:'stage52_53:event',
    runId:'stage52_53',
    mode:'realtime',
    barIndex:4,
    timestamp:1780000000000,
    sequence:1,
    name:'LONG',
    destinations: longRoutes!.destinations,
  });
  const router = new CoreSpiritEventRouter();
  router.register({kind:'webhook', target:'my-server', handle:async (_event, dest)=>{ seen.push(`${dest.kind}:${dest.target}`); }});
  router.register({kind:'notification', handle:async (_event, dest)=>{ seen.push(dest.kind); }});
  router.register({kind:'automation', target:'Momentum', handle:async (_event, dest)=>{ seen.push(`${dest.kind}:${dest.target}`); }});
  const deliveries = await router.dispatch(event);
  if (deliveries.length !== 3 || seen.length !== 3) throw new Error('one event did not fan out to all declared destinations');

  const v1 = new CoreSpiritV1Runtime();
  const artifact = v1.compile('emit "LONG"', 'stage52_53-v1', 'script');
  const v1Result = v1.runHistorical(artifact, {
    id:'stage52_53-dataset',
    version:1,
    source:'replay',
    symbol:'TEST',
    timeframe:'5m',
    bars:[{timestamp:'2026-09-27T09:15:00Z',open:100,high:102,low:99,close:101,volume:1000}],
  });
  if (!v1Result.events || v1Result.events.events.length !== 1) throw new Error('v1 runtime did not expose canonical event batch');

  return 'STAGE52_53_EVENT_WHEN_OK';
}

runStage52_53EventWhenSurfaceContract().then(console.log).catch(error => { throw error; });
