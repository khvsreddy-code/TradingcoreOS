import { CoreSpiritOutputDispatcher } from './outputDispatcher';

const dispatcher = new CoreSpiritOutputDispatcher();

const series = (time: number, value: number | null) => ({
  kind: 'series' as const,
  time,
  value,
  name: 'close',
  seriesId: 'p0:test',
});

const first = dispatcher.accept([series(1, 100)]);
const firstPlot = first.plots.get('p0:test');
if (!firstPlot || firstPlot.length !== 1) throw new Error('P0 dispatcher did not retain the initial plot point');

const second = dispatcher.accept([series(2, 101)]);
const secondPlot = second.plots.get('p0:test');
if (!secondPlot || secondPlot.length !== 2) throw new Error('P0 dispatcher did not append the plot point');
if (second.plots !== first.plots) throw new Error('P0 frame recreated the plot map');
if (secondPlot !== firstPlot) throw new Error('P0 frame recreated the retained plot array');

const third = dispatcher.accept([series(3, 102)]);
const thirdPlot = third.plots.get('p0:test');
if (!thirdPlot || thirdPlot.length !== 3) throw new Error('dispatcher did not retain the third plot point');
if (thirdPlot !== firstPlot) throw new Error('plot history identity changed between realtime frames');

console.log('P0_INCREMENTAL_OUTPUT_CONTRACT_OK');
