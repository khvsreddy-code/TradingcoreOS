import { normalizeCoreSpiritSource } from './surfaceForms';
import { getCoreSpiritCompletions, getCoreSpiritHover } from './languageService';
import { CORE_SPIRIT_LIBRARY_GROUPS, CORE_SPIRIT_STANDARD_LIBRARY } from './standardLibrary';

export function runCoreSpiritStage56_57StdlibReadabilityTest(): void {
  const groupOrder = CORE_SPIRIT_LIBRARY_GROUPS.map(x => x.id);
  const expected = ['price','math','trend','momentum','volatility','structure','market','models','visual','events','data','state'];
  if (groupOrder.join('|') !== expected.join('|')) throw new Error('stdlib discoverability order changed');
  if (CORE_SPIRIT_STANDARD_LIBRARY.length !== 30) throw new Error(`core stdlib executable count changed: ${CORE_SPIRIT_STANDARD_LIBRARY.length}`);

  const normalized = normalizeCoreSpiritSource(`
fast = ema(close, 20)
slow = ema(close, 50)
when fast crossesAbove slow:
  emit "LONG"
`);
  if (!normalized.includes('crossover(fast, slow)')) throw new Error('crossesAbove did not lower to crossover');
  if (!normalized.includes('emit("LONG");')) throw new Error('readable event surface did not lower');

  const operatorCompletions = getCoreSpiritCompletions('cross', { mode:'global', prefix:'cross' }, '');
  if (!operatorCompletions.some(x => x.label === 'crossesAbove') || !operatorCompletions.some(x => x.label === 'crossesBelow')) throw new Error('readable crossing completions missing');

  const modelMemberSource = 'nifty = market("NIFTY")\nvalue = nifty.cl';
  const members = getCoreSpiritCompletions('cl', { mode:'member', prefix:'cl', cursor:modelMemberSource.length }, modelMemberSource);
  if (!members.some(x => x.label === 'close')) throw new Error('market reference member completion missing');

  const directRef = 'market("NIFTY").cl';
  const directMembers = getCoreSpiritCompletions('cl', { mode:'member', prefix:'cl', cursor:directRef.length }, directRef);
  if (!directMembers.some(x => x.label === 'close')) throw new Error('direct market reference member completion missing');

  const hover = getCoreSpiritHover('crossesAbove');
  if (!hover?.documentation?.includes('crossover')) throw new Error('readable operator hover missing lowering contract');
}

console.log('STAGE56_57_STDLIB_READABILITY_OK');
